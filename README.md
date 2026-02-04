# Spacelift Flows CLI

The official CLI tool for building, managing, and deploying Spacelift Flows applications.

## Installation

```bash
npm install -g @useflows/flowctl
```

## Authentication

Before using most commands, you need to authenticate with the Spacelift Flows API.

### `flowctl auth login`

Interactively authenticate with the Spacelift Flows API to enable access to projects and apps.

### API Key

Alternatively you can use an API key, by setting the FLOWCTL_API_KEY and FLOWCTL_BASE_URL environment variables:

```bash
export FLOWCTL_API_KEY="sfapi_..."
export FLOWCTL_BASE_URL="https://useflows.eu"
````

#### Options

- `--base-url` (optional): API base URL (defaults to `http://localhost`)

#### Example

```bash
flowctl auth login
flowctl auth login --base-url https://my-instance.com
```

### `flowctl auth logout`

Remove stored authentication credentials.

#### Example

```bash
flowctl auth logout
```

## App Management

### `flowctl app create`

Create a new Spacelift Flows application. This command will prompt for:

- App name
- App description
- Block color (hex color for the app's blocks)
- Block icon URL (path to the icon file)

#### Options

- `-p`/`--project` (optional): Project ID to create the app in

#### Example

```bash
flowctl app create
flowctl app create --project my-project-id
```

## Version Management

### `flowctl version create`

Create a new version of an existing app by building and uploading the app schema and UI code.

#### Options

- `-e`/`--entrypoint` (required): Path to the main app entrypoint file
- `-u`/`--uiEntrypoint` (optional): Path to the UI entrypoint file
- `-a`/`--app` (optional): App ID to create version for
- `-p`/`--project` (optional): Project ID
- `--version` (optional): Specific version number (otherwise prompts for SemVer bump)
- `-d`/`--debug` (optional): Enable debug output showing built code

#### Examples

```bash
# Create version with interactive prompts
flowctl version create -e main.ts

# Create version with UI and specific app
flowctl version create -e main.ts -u ui/index.tsx --app my-app-id

# Create version with debug output
flowctl version create -e main.ts --debug
```

### `flowctl version update`

Update an existing draft version with new code. Useful during development.

#### Options

- `-e`/`--entrypoint` (required): Path to the main app entrypoint file
- `-u`/`--uiEntrypoint` (optional): Path to the UI entrypoint file
- `--id` (optional): Version ID to update
- `-a`/`--app` (optional): App ID
- `-p`/`--project` (optional): Project ID
- `-w`/`--watch` (optional): Watch for file changes and auto-update
- `-d`/`--debug` (optional): Enable debug output

#### Examples

```bash
# Update version with interactive selection
flowctl version update -e main.ts

# Update with watch mode for development
flowctl version update -e main.ts -u ui/index.tsx --watch

# Update specific version
flowctl version update -e main.ts --id version-id
```

### `flowctl version publish`

Publish a draft version to make it available for use.

#### Options

- `--id` (optional): Version ID to publish
- `-a`/`--app` (optional): App ID
- `-p`/`--project` (optional): Project ID

#### Examples

```bash
# Publish with interactive selection
flowctl version publish

# Publish specific version
flowctl version publish --id version-id
```

### `flowctl version list`

List all versions for an app.

#### Options

- `-a`/`--app` (optional): App ID to list versions for
- `-p`/`--project` (optional): Project ID

#### Example

```bash
flowctl version list
flowctl version list --app my-app-id
```

### `flowctl version bundle`

Create a local .tar.gz bundle containing the built app schema and UI code. This command does not require authentication and works offline.

#### Options

- `-e`/`--entrypoint` (required): Path to the main app entrypoint file
- `-u`/`--uiEntrypoint` (optional): Path to the UI entrypoint file
- `-o`/`--output` (optional): Output path for bundle (defaults to `bundle.tar.gz`)
- `-d`/`--debug` (optional): Enable debug output showing built code

#### Examples

```bash
# Create bundle with default filename
flowctl version bundle -e main.ts

# Create bundle with UI and custom filename
flowctl version bundle -e main.ts -u ui/index.tsx -o my-app-v1.0.0.tar.gz

# Create bundle with debug output
flowctl version bundle -e main.ts --debug
```

The bundle contains:

- `main.js` - The built app schema code
- `ui.js` - The built UI code (if UI entrypoint provided)

## Development Workflow

### Typical Development Flow

1. **Authenticate**: `flowctl auth login`
2. **Create App**: `flowctl app create`
3. **Create Initial Version**: `flowctl version create -e main.ts`
4. **Develop with Watch Mode**: `flowctl version update -e main.ts --watch`
5. **Publish When Ready**: `flowctl version publish`

### Offline Development

Use `flowctl version bundle` to create distributable packages without requiring authentication:

```bash
# Create a bundle for distribution
flowctl version bundle -e main.ts -u ui/index.tsx -o my-app-v1.0.0.tar.gz
```

## Command Structure

All commands follow the pattern:

```
flowctl <command> <subcommand> [options]
```

Use `--help` with any command to see detailed usage information:

```bash
flowctl --help
flowctl version --help
flowctl version create --help
```
