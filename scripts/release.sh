#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SYSTEM_JSON="${ROOT_DIR}/system.json"
DIST_DIR="${ROOT_DIR}/dist"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed."
  echo "Install on macOS with: brew install jq"
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required but not installed."
  exit 1
fi

if [[ ! -f "${SYSTEM_JSON}" ]]; then
  echo "Error: system.json not found at ${SYSTEM_JSON}"
  exit 1
fi

SYSTEM_ID="$(jq -r '.id' "${SYSTEM_JSON}")"
VERSION="$(jq -r '.version' "${SYSTEM_JSON}")"
DOWNLOAD_URL="$(jq -r '.download // empty' "${SYSTEM_JSON}")"
MANIFEST_URL="$(jq -r '.manifest // empty' "${SYSTEM_JSON}")"
ZIP_NAME="${SYSTEM_ID}.zip"

if [[ -z "${SYSTEM_ID}" || "${SYSTEM_ID}" == "null" ]]; then
  echo "Error: system.json is missing a valid \"id\" field."
  exit 1
fi

if [[ -z "${VERSION}" || "${VERSION}" == "null" ]]; then
  echo "Error: system.json is missing a valid \"version\" field."
  exit 1
fi

if [[ -z "${MANIFEST_URL}" || "${MANIFEST_URL}" == "null" ]]; then
  echo "Error: system.json is missing \"manifest\" URL."
  exit 1
fi

if [[ -z "${DOWNLOAD_URL}" || "${DOWNLOAD_URL}" == "null" ]]; then
  echo "Error: system.json is missing \"download\" URL."
  exit 1
fi

if [[ "${DOWNLOAD_URL}" != *"/${ZIP_NAME}" ]]; then
  echo "Error: download URL must end with /${ZIP_NAME}"
  echo "Current: ${DOWNLOAD_URL}"
  exit 1
fi

if [[ "${MANIFEST_URL}" != *"/system.json" ]]; then
  echo "Error: manifest URL must end with /system.json"
  echo "Current: ${MANIFEST_URL}"
  exit 1
fi

PACK_PATH_ERRORS="$(jq -r '.packs[]? | select((.path // "") == "") | .name' "${SYSTEM_JSON}")"
if [[ -n "${PACK_PATH_ERRORS}" ]]; then
  echo "Error: these pack definitions are missing path:"
  echo "${PACK_PATH_ERRORS}"
  exit 1
fi

while IFS= read -r pack_path; do
  [[ -z "${pack_path}" ]] && continue
  if [[ ! -d "${ROOT_DIR}/${pack_path}" ]]; then
    echo "Error: pack path does not exist: ${pack_path}"
    exit 1
  fi
done < <(jq -r '.packs[]?.path' "${SYSTEM_JSON}")

mkdir -p "${DIST_DIR}"
cp "${SYSTEM_JSON}" "${DIST_DIR}/system.json"

OUTPUT_ZIP="${DIST_DIR}/${ZIP_NAME}"
rm -f "${OUTPUT_ZIP}"

pushd "${ROOT_DIR}" >/dev/null
zip -rq "${OUTPUT_ZIP}" . \
  -x ".git/*" \
  -x ".agents/*" \
  -x "dist/*" \
  -x "*.DS_Store" \
  -x "prompts.log" \
  -x "turn-of-the-century.zip"
popd >/dev/null

echo "Built release artifacts:"
echo "- ${DIST_DIR}/system.json"
echo "- ${OUTPUT_ZIP}"
echo "Version: ${VERSION}"
