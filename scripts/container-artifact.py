"""Inspect an existing docker-save archive only; never extract, load or run it."""
import hashlib
import json
import re
import sys
import tarfile

archive, expected = sys.argv[1:]
assert re.fullmatch(r"[0-9a-f]{40}", expected), "invalid source SHA"
with tarfile.open(archive, "r:") as tar:
    def read_json(name):
        member = tar.getmember(name)
        assert member.isfile() and member.size <= 4 * 1024 * 1024, "unsafe metadata"
        return json.load(tar.extractfile(member))

    manifests = read_json("manifest.json")
    assert len(manifests) == 1, "exactly one image required"
    manifest = manifests[0]
    member = tar.getmember(manifest["Config"])
    assert member.isfile() and member.size <= 4 * 1024 * 1024
    config_bytes = tar.extractfile(member).read()
    config = json.loads(config_bytes)
    assert (config["os"], config["architecture"]) == ("linux", "amd64")
    runtime = config["config"]
    assert runtime["User"] == "node", "non-root runtime required"
    assert runtime["Labels"]["org.opencontainers.image.revision"] == expected
    assert runtime["Labels"]["org.opencontainers.image.source"] == "https://github.com/z915084508/hispafly-aoc"
    assert runtime["Cmd"] == ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
    # The inherited official Node entrypoint only execs the explicit command.
    assert runtime.get("Entrypoint") in (None, ["docker-entrypoint.sh"])
    names = {item.split("=", 1)[0] for item in runtime.get("Env", [])}
    assert names <= {"PATH", "NODE_VERSION", "YARN_VERSION", "NODE_ENV", "NEXT_TELEMETRY_DISABLED", "PORT"}, "unexpected baked environment"
    assert not runtime.get("Volumes"), "implicit shared storage prohibited"
    # Read only this generated inventory from final-image layers; never extract.
    inventory_path = "usr/local/share/hispafly/runtime-native-inventory.json"
    inventory = None
    for layer_name in manifest["Layers"]:
        layer_member = tar.getmember(layer_name)
        assert layer_member.isfile(), "unsafe layer reference"
        with tarfile.open(fileobj=tar.extractfile(layer_member), mode="r:*") as layer:
            for item in layer:
                normalized = item.name.removeprefix("./").lstrip("/")
                if normalized == "usr/local/share/hispafly/.wh.runtime-native-inventory.json":
                    inventory = None
                if normalized == inventory_path:
                    assert item.isfile() and item.size <= 4 * 1024 * 1024
                    inventory = json.load(layer.extractfile(item))
    assert inventory is not None, "final runtime native inventory missing"
    print(json.dumps({
        "sourceSha": expected,
        "platform": "linux/amd64",
        "imageConfigId": "sha256:" + hashlib.sha256(config_bytes).hexdigest(),
        "tags": manifest["RepoTags"],
        "layerCount": len(manifest["Layers"]),
        "nativeInventory": inventory,
        "registryManifestDigest": None,
        "note": "Config ID, BuildKit digest and archive SHA-256 are distinct; no registry publication."
    }, indent=2))
