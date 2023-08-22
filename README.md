[![Package Release](https://github.com/Iron-Stag-Games/Lync/actions/workflows/pkg.yml/badge.svg)](https://github.com/Iron-Stag-Games/Lync/actions/workflows/pkg.yml) [![Build and Publish Sample Project](https://github.com/Iron-Stag-Games/Lync/actions/workflows/Publish-main.yml/badge.svg)](https://github.com/Iron-Stag-Games/Lync/actions/workflows/Publish-main.yml)

# What is Lync?

Lync is a file sync tool for Roblox which is offered as an alternative to Rojo focused on expanding the feature set from community feedback and improving maintainability.

This tool is currently provided without any documentation whatsoever! Because the two tools are so similar, please refer to [the Rojo documentation](https://rojo.space/docs/v7/) for the time being.

## Usage

- [Node.js](https://nodejs.org/) must be installed for Lync to run.
- [Lune](https://github.com/filiptibell/lune) must be installed for offline RBXL builds. You can specify the path to your Lune installation in the config file.
- [pkg](https://www.npmjs.com/package/pkg) can be used to package Lync into an executable if desired. In the future, this will be automatically generated on GitHub.

## Configuration

The [config file](https://github.com/Iron-Stag-Games/Lync/blob/main/Lync/config.json) is located in your Lync installation.

- Windows: `%LOCALAPPDATA%\Roblox\Lync\config.json`
- MacOS: `$HOME/Documents/Roblox/Lync/config.json`

It contains several settings which might be necessary to change in order to use Lync.

You can also specify whether or not to install updates automatically, and from which repository.

# How does Lync compare to Rojo?

### Legend
| Symbol | Meaning |
|-|-|
| ✅️ | Available |
| ❌️ | Unavailable |
| … | Pending / WIP |
| ⚠️ | Broken |

### Features
| | Lync | Rojo |
|-|-|-|
| [Optional Automatic Updates](https://github.com/Iron-Stag-Games/Lync#configuration) | ✅️ | ❌️ |
| Offline Builds | ✅️ | ✅️ |
| Automatic Sourcemap Generation | ✅️ | ❌️ |
| Playtest Sync | ✅️ | ❌️ |
| MeshPart Sync | ✅️ | ❌️ |
| Full Reverse Sync | ❌️ | ⚠️ |
| Manual Reverse Script Sync | ✅️ | ❌️ |
| Unsaved Model Warnings | ✅️ | ❌️ |
| Patch Viewer | ❌️ | ✅️ |
| Multiple Project Serving | ❌️ | ✅️ |
| Server IP Address | ❌️ | ✅️ |
| Server Port | ✅️ | ✅️ |
| Custom File Downloads | … | ❌️ |
| Automatic Shell Scripts | … | ❌️ |
| Place to Project Tool | ❌️ | ⚠️ |

### File Types
| | Lync | Rojo |
|-|-|-|
| `*.Project.JSON` | ✅️ | ✅️ |
| `*.Model.JSON` | ✅️ | ✅️ |
| `RBXM`/`RBXMX` | ✅️ | ✅️ |
| `LUAU`/`LUA` | ✅️ | ✅️ |
| `Init.LUA` (Anonymous) | ✅️ | ✅️ |
| `*.Init.LUA` (Named) | ✅️ | ❌️ |
| `JSON` | ✅️ | ✅️ |
| `YAML` | ✅️ | ❌️ |
| `TOML` | ✅️ | ✅️ |
| `XLSX`/`XLS` | ✅️ | ❌️ |
| `TXT` | ✅️ | ✅️ |
| `CSV` ([LocalizationTable](https://create.roblox.com/docs/reference/engine/classes/LocalizationTable)) | ⚠️ | ✅️ |
| `*.Meta.JSON` | ✅️ | ✅️ |
| `*.Meta.YAML` | ✅️ | ❌️ |
| `*.Meta.TOML` | ✅️ | ❌️ |

### Pros
- Much faster live sync.
- Designed from the ground up to be compatible with all future Roblox properties.
- Several important bugs fixed, like Model duplication.
- No compilation of Lync necessary - edit and go!

### Cons
- Nearly fully compatibile with existing Rojo projects. JSON files, including [the project JSON](https://github.com/Iron-Stag-Games/Lync/blob/main/Sample%20Project/default.project.json) must be changed.
- Currently unable to use `LocalizationTable` in offline RBXL builds.
- Lack of documentation.


## Syntax
| Lync | Rojo |
|-|-|
| $attributes | $properties.Attributes |
| $tags | $properties.{any array} |
| $clearOnSync | $ignoreUnknownInstances |
| Terrain.$terrainRegion | Terrain.$path |
| Terrain.$terrainMaterialColors | Terrain.$path |


# Package Compatibility Notice

Complex expressions in property fields may not be supported by other tools, so please avoid doing things like math or calling string functions when releasing packages.
Simple expressions like `Color3.new(0, 0, 0)` are easy for other tools to interpret without using a Luau VM.

# Games made with Lync

- [ExoTech](https://www.roblox.com/games/7634484468) - Iron Stag Games
- [Traitor Town](https://www.roblox.com/games/255236425) - Traitor Town
- [RB Battles](https://www.roblox.com/games/5036207802) - RB Battles Games
- NDA title - RB Battles PVP
- NDA title #1 - Fund For Games
- NDA title #2 - Fund For Games
- NDA title - Purple Toast Productions
