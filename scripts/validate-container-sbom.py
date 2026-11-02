"""Read-only gate: match actual runtime native inventory to CycloneDX packages."""
import json
import sys
from pathlib import Path

identity = json.loads(Path(sys.argv[1]).read_text())
sbom = json.loads(Path(sys.argv[2]).read_text())
pins = json.loads(Path(sys.argv[3]).read_text())
assert sbom.get("bomFormat") == "CycloneDX", "CycloneDX SBOM required"
inventory = identity["nativeInventory"]
assert inventory["platform"] == "linux/amd64"
assert inventory["checkedBinaryCount"] > 1
components = sbom.get("components", [])


def component_for(manager, name, version):
    prefix = "pkg:deb/" if manager == "dpkg" else "pkg:npm/"
    assert manager in ("dpkg", "npm"), "unknown native-library owner"
    matches = [c for c in components
               if c.get("version") == version
               and c.get("purl", "").startswith(prefix)
               and name in (c.get("name"), c.get("group", "") + "/" + c.get("name", ""))]
    assert matches, f"runtime package absent from SBOM: {manager}:{name}@{version}"
    return matches[0]


for name, version in pins["packages"].items():
    installed = [p for p in inventory["packages"] if p["name"] == name and p["version"] == version]
    assert installed, f"pinned runtime package missing: {name}"
    component_for("dpkg", name, version)

required_results = []
for library in inventory["libraries"]:
    owner = library["owner"]
    component_for(owner["manager"], owner["name"], owner["version"])
for required in pins["requiredLibraries"]:
    actual = [item for item in inventory["libraries"] if item["path"] == required["path"]]
    assert len(actual) == 1, "required OpenSSL library missing/ambiguous"
    item = actual[0]
    owner = item["owner"]
    assert owner["manager"] == "dpkg" and owner["name"] == required["package"]
    assert owner["version"] == pins["packages"][owner["name"]]
    component = component_for("dpkg", owner["name"], owner["version"])
    required_results.append({"library": required["path"], "sha256": item["sha256"],
                             "package": owner["name"], "version": owner["version"],
                             "sbomPurl": component["purl"]})
print(json.dumps({"status": "PASS", "requiredLibraries": required_results,
                  "attributedLibraryCount": len(inventory["libraries"])}, indent=2))
