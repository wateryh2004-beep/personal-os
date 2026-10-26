#!/usr/bin/env python3
"""Prefer the runner's existing official HTTPS archive without changing trust.

Runner format: https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh
APT priority semantics: https://manpages.ubuntu.com/manpages/jammy/man1/apt-transport-mirror.1.html
Only ephemeral GitHub Ubuntu runners are eligible. --self-test writes tmp fixtures.
"""
import os
from pathlib import Path
import re
import sys
import tempfile

AZURE = "http://azure.archive.ubuntu.com/ubuntu/"
ARCHIVE = "https://archive.ubuntu.com/ubuntu/"
SECURITY = "https://security.ubuntu.com/ubuntu/"
MIRROR_REFERENCE = "mirror+file:/etc/apt/apt-mirrors.txt"


def prefer_archive(text):
    """Change only two priority tokens in the documented three-mirror format."""
    rows = {}
    lines = text.splitlines(keepends=True)
    for index, line in enumerate(lines):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        uri, separator, metadata = line.rstrip("\r\n").partition("\t")
        priorities = re.findall(r"(?<!\S)priority:(\d+)(?!\S)", metadata)
        if uri not in {AZURE, ARCHIVE, SECURITY} or uri in rows or not separator or len(priorities) != 1:
            raise ValueError("Unsupported runner mirror list; left unchanged")
        rows[uri] = (index, int(priorities[0]))
    if set(rows) != {AZURE, ARCHIVE, SECURITY}:
        raise ValueError("Expected existing official runner mirrors; left unchanged")
    current = {uri: entry[1] for uri, entry in rows.items()}
    if current == {AZURE: 2, ARCHIVE: 1, SECURITY: 3}:
        return text
    if current != {AZURE: 1, ARCHIVE: 2, SECURITY: 3}:
        raise ValueError("Unsupported runner mirror priorities; left unchanged")
    for uri, priority in [(ARCHIVE, 1), (AZURE, 2)]:
        index = rows[uri][0]
        lines[index] = re.sub(r"(?<!\S)priority:\d+(?!\S)", f"priority:{priority}", lines[index])
    return "".join(lines)


def prepare(root, github_actions, runner_os):
    if github_actions != "true" or runner_os != "Linux":
        return "skipped: this helper only configures GitHub Actions Linux runners"
    release = root / "etc/os-release"
    if not release.is_file() or not re.search(r'^ID=[\"\']?ubuntu[\"\']?$', release.read_text(), re.MULTILINE):
        return "skipped: runner is not Ubuntu"
    sources = [root / "etc/apt/sources.list", root / "etc/apt/sources.list.d/ubuntu.sources"]
    reference = re.escape(MIRROR_REFERENCE)
    active_reference = rf"^(?:URIs:\s+|deb(?:-src)?\s+(?:\[[^\]]*\]\s+)?){reference}(?:\s|$)"
    if not any(path.is_file() and re.search(active_reference, path.read_text(), re.MULTILINE) for path in sources):
        raise ValueError("Unsupported runner APT source: expected documented mirror list")
    mirror = root / "etc/apt/apt-mirrors.txt"
    if not mirror.is_file() or mirror.is_symlink():
        raise ValueError("Expected a regular runner mirror list; left unchanged")
    original = mirror.read_text()
    updated = prefer_archive(original)
    if updated != original:
        mirror.write_text(updated)
        return "preferred existing HTTPS Ubuntu archive; Azure fallback and security mirror retained"
    return "existing HTTPS Ubuntu archive already preferred"


def self_test():
    original = f"# runner mirrors\n{AZURE}\tpriority:1\n{ARCHIVE}\tpriority:2\n{SECURITY}\tpriority:3\n"
    with tempfile.TemporaryDirectory(prefix="personal-os-ci-apt-") as directory:
        root = Path(directory)
        (root / "etc/apt/sources.list.d").mkdir(parents=True)
        (root / "etc/os-release").write_text('ID=ubuntu\nVERSION_ID="24.04"\n')
        source = root / "etc/apt/sources.list.d/ubuntu.sources"
        source_text = f"Types: deb\nURIs: {MIRROR_REFERENCE}\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n"
        source.write_text(source_text)
        mirror = root / "etc/apt/apt-mirrors.txt"
        mirror.write_text(original)
        assert prepare(root, "false", "Linux").startswith("skipped:")
        assert prepare(root, "true", "macOS").startswith("skipped:")
        assert mirror.read_text() == original
        (root / "etc/os-release").write_text("ID=debian\n")
        assert prepare(root, "true", "Linux").startswith("skipped:")
        assert mirror.read_text() == original
        (root / "etc/os-release").write_text('ID="ubuntu"\n')
        prepare(root, "true", "Linux")
        changed = mirror.read_text()
        assert f"{ARCHIVE}\tpriority:1\n" in changed
        assert f"{AZURE}\tpriority:2\n" in changed
        assert f"{SECURITY}\tpriority:3\n" in changed
        assert changed.startswith("# runner mirrors\n")
        assert source.read_text() == source_text
        assert "already preferred" in prepare(root, "true", "Linux")
        assert mirror.read_text() == changed
        for unsupported in [original.replace(ARCHIVE, "https://example.invalid/ubuntu/"), original.replace("priority:2", "priority:7"), original + f"{ARCHIVE}\tpriority:2\n"]:
            mirror.write_text(unsupported)
            try:
                prepare(root, "true", "Linux")
            except ValueError:
                pass
            else:
                raise AssertionError("Unknown mirrors/priorities/duplicates must fail before writing")
            assert mirror.read_text() == unsupported
        metadata = original.replace("priority:1", "priority:1 arch:amd64 type:deb")
        assert "priority:2 arch:amd64 type:deb" in prefer_archive(metadata)
        assert source.read_text() == source_text
        source.write_text(f"# URIs: {MIRROR_REFERENCE}\nURIs: https://archive.ubuntu.com/ubuntu/\n")
        mirror.write_text(original)
        try:
            prepare(root, "true", "Linux")
        except ValueError:
            pass
        else:
            raise AssertionError("A commented reference must not count as an active APT source")
        assert mirror.read_text() == original
    print("PASS: existing-mirror priorities, idempotence, metadata/trust preservation, unsupported inputs, and non-CI/non-Ubuntu guards (temporary fixtures only)")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--self-test"]:
            self_test()
        elif sys.argv[1:]:
            raise ValueError("Only --self-test is supported; runner paths cannot be overridden")
        else:
            print(prepare(Path("/"), os.environ.get("GITHUB_ACTIONS"), os.environ.get("RUNNER_OS")))
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
