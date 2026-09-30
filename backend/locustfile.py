from locust import HttpUser, task, between


class NexoraUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        # Auth: get token
        resp = self.client.post("/api/v1/auth/telegram/init")
        self.token = resp.json().get("token", "")
        # Complete auth (simulate bot)
        self.client.post("/api/v1/internal/auth/complete", json={
            "token": self.token,
            "telegram_id": f"load_{id(self)}",
            "username": "loadtest",
            "first_name": "Load",
            "last_name": "Test",
        })
        import time
        time.sleep(1)
        resp = self.client.get(f"/api/v1/auth/telegram/poll/{self.token}")
        data = resp.json()
        self.access = data.get("access_token", "")
        self.headers = {"Authorization": f"Bearer {self.access}"}
        # Join group
        self.client.post("/api/v1/groups/231-329/join", headers=self.headers)

    @task(3)
    def get_schedule(self):
        self.client.get("/api/v1/schedule?group=231-329&start_date=2026-05-19", headers=self.headers)

    @task(2)
    def get_tasks(self):
        self.client.get("/api/v1/tasks?group_id=GROUP_ID_PLACEHOLDER", headers=self.headers)

    @task(2)
    def get_dashboard(self):
        self.client.get("/api/v1/dashboard?group_code=231-329", headers=self.headers)

    @task(1)
    def get_notifications(self):
        self.client.get("/api/v1/notifications", headers=self.headers)

    @task(1)
    def create_assignment(self):
        self.client.post("/api/v1/assignments", headers=self.headers, json={
            "group_id": "GROUP_ID_PLACEHOLDER",
            "subject_id": "SUBJECT_ID_PLACEHOLDER",
            "title": f"Load test assignment {id(self)}",
            "description": "Load test",
            "deadline": "2026-06-01T23:59:00Z",
            "priority": "normal"
        })
