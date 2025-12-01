#!/bin/bash
#
# Release script for @skybolt/server-adapter (Node.js/Bun adapter)
#
# Usage: ./scripts/release.sh [patch|minor|major] [--push]
#
# This script:
# 1. Bumps the version in VERSION file
# 2. Syncs the version to package.json and src/skybolt.js
# 3. Commits the changes (and pushes if --push is specified)
#
# The split repo's tag-version.yml workflow will automatically create the tag.

set -e

BUMP_TYPE=""
PUSH=false

for arg in "$@"; do
    case "$arg" in
        --push)
            PUSH=true
            ;;
        patch|minor|major)
            BUMP_TYPE="$arg"
            ;;
    esac
done

BUMP_TYPE=${BUMP_TYPE:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Usage: $0 [patch|minor|major] [--push]"
    exit 1
fi

# Get script directory and package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PACKAGE_DIR"

# Read current version
CURRENT_VERSION=$(cat VERSION | tr -d '[:space:]')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump version
case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

echo "Bumping version: ${CURRENT_VERSION} → ${NEW_VERSION}"

# Update VERSION file
echo "$NEW_VERSION" > VERSION

# Update package.json - version field
sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json

# Update src/skybolt.js - @version tag in module docstring
sed -i '' "s/@version ${CURRENT_VERSION}/@version ${NEW_VERSION}/" src/skybolt.js

echo "Updated: VERSION, package.json, src/skybolt.js"

# Commit and optionally push
git add "$PACKAGE_DIR"
git commit -m "chore(javascript): bump @skybolt/server-adapter to v${NEW_VERSION}"

if [ "$PUSH" = true ]; then
    git push origin main
    echo ""
    echo "✓ Pushed @skybolt/server-adapter v${NEW_VERSION}"
    echo ""
    echo "Once synced to the split repo, tag-and-publish.yml will create the v${NEW_VERSION} tag and publish to NPM."
else
    echo ""
    echo "✓ Committed @skybolt/server-adapter v${NEW_VERSION} (not pushed)"
    echo ""
    echo "Run 'git push origin main' when ready."
fi
