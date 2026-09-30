"""Импорт задач из tasks.yml в GitHub Issues.

Создаёт недостающие метки и milestones, затем issues.
Повторный запуск безопасен: существующие issues (по заголовку) пропускаются.

Переменные окружения:
  GH_TOKEN    — токен пользователя, от чьего имени создаются issues
  REPO        — owner/name
  DRY_RUN     — "true", чтобы только показать план
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import yaml

API = "https://api.github.com"
TOKEN = os.environ["GH_TOKEN"]
REPO = os.environ["REPO"]
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"


class ApiError(Exception):
    pass


def call(method, path, body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        raise ApiError(f"{method} {path} → {e.code}: {e.read().decode()}") from e


def paginate(path):
    items, page = [], 1
    sep = "&" if "?" in path else "?"
    while True:
        batch = call("GET", f"{path}{sep}per_page=100&page={page}")
        items += batch
        if len(batch) < 100:
            return items
        page += 1


def write(method, path, body, what):
    print(("[dry-run] " if DRY_RUN else "") + what)
    if DRY_RUN:
        return None
    result = call(method, path, body)
    time.sleep(1.2)  # вторичный rate limit GitHub на создание контента
    return result


def graphql(query, variables):
    result = call("POST", "/graphql", {"query": query, "variables": variables})
    if result.get("errors"):
        raise ApiError(f"GraphQL: {result['errors']}")
    return result["data"]


PROJECT_QUERY = """
query($login: String!, $number: Int!) {
  %s(login: $login) {
    projectV2(number: $number) {
      id
      title
      fields(first: 50) {
        nodes { ... on ProjectV2SingleSelectField { id name options { id name } } }
      }
    }
  }
}
"""

ADD_ITEM = """
mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: {projectId: $project, contentId: $content}) {
    item {
      id
      fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    }
  }
}
"""

SET_STATUS = """
mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $project, itemId: $item, fieldId: $field,
    value: {singleSelectOptionId: $option}
  }) { projectV2Item { id } }
}
"""


def load_project(owner, number):
    for kind in ("organization", "user"):
        try:
            data = graphql(PROJECT_QUERY % kind, {"login": owner, "number": number})
        except ApiError:
            continue
        project = (data.get(kind) or {}).get("projectV2")
        if project:
            return project
    raise ApiError(f"Проект {owner}/{number} не найден или у токена нет права Projects")


def sync_project(cfg, issues):
    """Добавляет issues на доску. Статус ставится только пустым карточкам."""
    proj_cfg = cfg.get("project")
    if not proj_cfg:
        return
    if DRY_RUN:
        print(f"[dry-run] доска {proj_cfg['owner']}/projects/{proj_cfg['number']}: добавить {len(issues)} задач")
        return
    project = load_project(proj_cfg["owner"], proj_cfg["number"])
    status = next((f for f in project["fields"]["nodes"] if f and f.get("name") == "Status"), None)
    options = {o["name"].lower(): o["id"] for o in (status or {}).get("options", [])}
    print(f"\nДоска «{project['title']}»")
    added = 0
    for issue in issues:
        item = graphql(ADD_ITEM, {"project": project["id"], "content": issue["node_id"]})
        item = item["addProjectV2ItemById"]["item"]
        if status and not item.get("fieldValueByName"):
            want = "done" if issue["state"] == "closed" else "todo"
            if want in options:
                graphql(SET_STATUS, {"project": project["id"], "item": item["id"],
                                     "field": status["id"], "option": options[want]})
        added += 1
        time.sleep(0.5)
    print(f"На доске: {added} задач")


def main():
    cfg = yaml.safe_load(Path(__file__).with_name("tasks.yml").read_text(encoding="utf-8"))
    repo = f"/repos/{REPO}"

    # Метки
    existing = {l["name"]: l for l in paginate(f"{repo}/labels")}
    for label in cfg["labels"]:
        if label["name"] not in existing:
            write("POST", f"{repo}/labels", label, f"метка: {label['name']}")

    # Milestones
    ms = {m["title"]: m["number"] for m in paginate(f"{repo}/milestones?state=all")}
    phase_ms = {}
    for i, m in enumerate(cfg["milestones"]):
        if m["title"] not in ms:
            created = write("POST", f"{repo}/milestones", m, f"milestone: {m['title']}")
            ms[m["title"]] = created["number"] if created else None
        phase_ms[i] = ms[m["title"]]

    # Issues
    all_issues = [i for i in paginate(f"{repo}/issues?state=all") if "pull_request" not in i]
    by_title = {i["title"]: i for i in all_issues}
    titles = set(by_title)
    people = cfg.get("people", {})
    created = skipped = 0
    for task in cfg["tasks"]:
        if task["title"] in titles:
            skipped += 1
            continue
        issue = None
        body = {
            "title": task["title"],
            "body": (task.get("body") or "").strip(),
            "labels": task.get("labels", []),
        }
        if phase_ms.get(task["phase"]):
            body["milestone"] = phase_ms[task["phase"]]
        login = people.get(task.get("owner", ""), "")
        if login:
            body["assignees"] = [login]
        try:
            issue = write("POST", f"{repo}/issues", body, f"issue: {task['title']}")
        except ApiError as e:
            if "assignees" not in body:
                raise
            print(f"  ⚠ {login} нельзя назначить (не коллаборатор?) — создаю без исполнителя")
            body.pop("assignees")
            issue = write("POST", f"{repo}/issues", body, f"issue: {task['title']}")
        if issue and task.get("closed"):
            issue = write("PATCH", f"{repo}/issues/{issue['number']}",
                          {"state": "closed", "state_reason": "completed"}, f"  закрыт: #{issue['number']}")
        if issue:
            by_title[issue["title"]] = issue
        created += 1

    print(f"\nГотово: создано {created}, пропущено (уже есть) {skipped}")

    # Доска: все задачи из tasks.yml
    roadmap = [by_title[t["title"]] for t in cfg["tasks"] if t["title"] in by_title]
    if DRY_RUN:
        roadmap = [None] * len(cfg["tasks"])
    sync_project(cfg, roadmap)


if __name__ == "__main__":
    try:
        main()
    except ApiError as e:
        sys.exit(str(e))
