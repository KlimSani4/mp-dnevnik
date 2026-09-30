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
    titles = {i["title"] for i in paginate(f"{repo}/issues?state=all") if "pull_request" not in i}
    people = cfg.get("people", {})
    created = skipped = 0
    for task in cfg["tasks"]:
        if task["title"] in titles:
            skipped += 1
            continue
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
            write("PATCH", f"{repo}/issues/{issue['number']}",
                  {"state": "closed", "state_reason": "completed"}, f"  закрыт: #{issue['number']}")
        created += 1

    print(f"\nГотово: создано {created}, пропущено (уже есть) {skipped}")


if __name__ == "__main__":
    try:
        main()
    except ApiError as e:
        sys.exit(str(e))
