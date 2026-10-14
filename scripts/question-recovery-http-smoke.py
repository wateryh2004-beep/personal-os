# Synthetic localhost-only integration test; run after npm run build.
import base64, hashlib, json, os, re, subprocess, threading, time, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from html.parser import HTMLParser
from pathlib import Path

# Only local fixture/app traffic; do not route loopback through a remote proxy.
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

owner = {"id": "11111111-1111-4111-8111-111111111111", "email": "owner@example.com", "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}
calls = []
attempts = 0
def b64(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
token = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64({"sub": owner["id"], "email": owner["email"], "exp": int(time.time())+3600, "aud": "authenticated", "role": "authenticated"}) + ".synthetic-signature"

class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def dispatch(self):
        global attempts
        raw = self.rfile.read(int(self.headers.get("content-length", "0")))
        body = json.loads(raw) if raw else {}
        calls.append((self.command, self.path, body))
        status = 200
        if self.path == "/rest/v1/rpc/consume_question_recovery_attempt":
            attempts += 1
            result = attempts <= 5
        elif self.path == "/auth/v1/token?grant_type=password":
            if body.get("email") == owner["email"] and body.get("password") == "synthetic-login-password":
                result = {"access_token": token, "refresh_token": "synthetic-refresh", "expires_in": 3600, "token_type": "bearer", "user": owner}
            else:
                status, result = 400, {"code": "invalid_credentials", "msg": "Synthetic invalid login"}
        elif self.path == "/auth/v1/user" and self.command == "GET":
            result = owner
        elif self.path.startswith("/auth/v1/recover"):
            result = {}
        elif self.path == "/auth/v1/admin/users/" + owner["id"]:
            result = owner
        elif self.path == "/auth/v1/admin/generate_link":
            assert body["type"] == "recovery" and body["email"] == owner["email"]
            result = dict(owner, hashed_token="synthetic-token", action_link="https://invalid.test/never-return", email_otp="123456", verification_type="recovery", redirect_to="")
        elif self.path == "/auth/v1/verify":
            assert body["type"] == "recovery" and body["token_hash"] == "synthetic-token"
            result = {"access_token": token, "refresh_token": "synthetic-refresh", "expires_in": 3600, "token_type": "bearer", "user": owner}
        elif self.path == "/auth/v1/user" and self.command == "PUT":
            assert body["password"] == "new-password-123"
            result = owner
        elif self.path == "/auth/v1/logout?scope=global":
            status, result = 204, None
        else:
            raise AssertionError("Unexpected fixture request " + self.path)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if result is not None: self.wfile.write(json.dumps(result).encode())
    do_GET = do_POST = do_PUT = dispatch

class FormParser(HTMLParser):
    def __init__(self): super().__init__(); self.forms = []; self.current = None
    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "form": self.current = {}; self.forms.append(self.current)
        if tag == "input" and self.current is not None and data.get("name", "").startswith("$ACTION_"):
            self.current[data["name"]] = data.get("value", "")
    def handle_endtag(self, tag):
        if tag == "form": self.current = None

fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
threading.Thread(target=fixture.serve_forever, daemon=True).start()
salt = bytes([1])*16
verifier = "scrypt-v1:" + salt.hex() + ":" + hashlib.scrypt(b"alpha\nbeta", salt=salt, n=16384, r=8, p=1, dklen=32).hex()
environment = dict(os.environ, NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost", VERCEL_ENV="production", APP_URL="https://synthetic-app.invalid", NEXT_PUBLIC_SUPABASE_URL=f"http://127.0.0.1:{fixture.server_port}", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="synthetic-publishable", SUPABASE_SECRET_KEY="synthetic-secret", OWNER_EMAIL=owner["email"], OWNER_USER_ID=owner["id"], PASSWORD_RECOVERY_ANSWER_HASH=verifier)
log = open("/tmp/question-recovery-http-app.log", "w")
app = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3199"], cwd=Path(__file__).resolve().parents[1], env=environment, stdout=log, stderr=log)
base = "http://127.0.0.1:3199"
try:
    for i in range(60):
        try:
            with urllib.request.urlopen(base + "/forgot-password", timeout=2) as response: html = response.read().decode()
            break
        except Exception:
            if app.poll() is not None: raise AssertionError("App exited; see /tmp/question-recovery-http-app.log")
            time.sleep(.5)
    else: raise AssertionError("App did not start")
    assert "你认为余航人生中最重要的事情是什么？" in html
    assert 'name="firstWord"' in html and 'name="secondWord"' in html
    assert "改用邮箱找回" in html
    assert "scrypt-v1:" not in html and "synthetic-secret" not in html
    parser = FormParser(); parser.feed(html)
    action_fields = parser.forms[0]
    assert any(key.startswith(("$ACTION_ID_", "$ACTION_REF_")) for key in action_fields), action_fields
    def submit(first, second):
        values = dict(action_fields, firstWord=first, secondWord=second, password="new-password-123", confirmPassword="new-password-123")
        boundary = "----synthetic-recovery-form-boundary"
        payload = "".join(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n' for key, value in values.items()) + f"--{boundary}--\r\n"
        request = urllib.request.Request(base + "/forgot-password", data=payload.encode(), headers={"Content-Type": "multipart/form-data; boundary=" + boundary, "Origin": base})
        with urllib.request.urlopen(request, timeout=10) as response:
            result = response.read().decode()
            assert "synthetic-token" not in result and token not in result
            assert "sb-" not in (response.headers.get("Set-Cookie") or "")
            return result
    before = len(calls)
    assert "答案不正确" in submit("alpha", "wrong")
    assert [call[1] for call in calls[before:]] == ["/rest/v1/rpc/consume_question_recovery_attempt"]
    assert "密码已更新，请返回登录。" in submit("ALPHA", "BeTa")
    expected = ["/auth/v1/admin/users/" + owner["id"], "/auth/v1/admin/generate_link", "/auth/v1/verify", "/auth/v1/user", "/auth/v1/logout?scope=global"]
    assert [call[1] for call in calls[2:]] == expected, calls
    attempts = 5
    before = len(calls)
    assert "尝试次数过多" in submit("ALPHA", "BETA")
    assert [call[1] for call in calls[before:]] == ["/rest/v1/rpc/consume_question_recovery_attempt"]
    print("PASS: Next rendered question form; real Server Action and Supabase SDK HTTP contracts; wrong-answer denial; case-insensitive reset; global sign-out; lockout; no token/cookie exposure. Synthetic local services only.")
    with urllib.request.urlopen(base + "/login", timeout=5) as response: login_html = response.read().decode()
    login_parser = FormParser(); login_parser.feed(login_html)
    def login(password):
        values = dict(login_parser.forms[0], email=owner["email"], password=password)
        boundary = "----synthetic-login-form-boundary"
        payload = "".join(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n' for key, value in values.items()) + f"--{boundary}--\r\n"
        request = urllib.request.Request(base + "/login", data=payload.encode(), headers={"Content-Type": "multipart/form-data; boundary=" + boundary, "Origin": base})
        with urllib.request.urlopen(request, timeout=10) as response:
            result = response.read().decode()
            assert token not in result and "synthetic-refresh" not in result
            return result, response.headers.get_all("Set-Cookie", [])
    denied, denied_cookies = login("wrong-synthetic-password")
    assert "登录失败" in denied and "auth-entering" not in denied and not denied_cookies
    accepted, accepted_cookies = login("synthetic-login-password")
    assert "auth-entering" in accepted and 'href="/today"' in accepted
    assert any("sb-" in cookie for cookie in accepted_cookies)
    print("PASS: real login action rejects failed credentials; success emits SDK session cookies and a confirmed entry state without serializing tokens.")
    if os.environ.get("AUTH_BROWSER_E2E") == "1":
        attempts = 0
        subprocess.run(["node", "scripts/auth-motion-e2e.cjs"], env=dict(os.environ, E2E_BASE_URL=base), check=True, timeout=120)
finally:
    app.terminate()
    app.wait(timeout=10)
    fixture.shutdown()
