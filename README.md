# What is Lync?

Lync is a file sync tool for Roblox which is offered as an alternative to Rojo focused on expanding the feature set from community feedback and improving maintainability.

> **Warning**
> This tool is currently provided without any documentation whatsoever! Because the two tools are so similar, please refer to [the Rojo documentation](https://rojo.space/docs/v7/) for the time being.

## Installation
- **Aftman** - `aftman add Iron-Stag-Games/Lync@version`
- **Manual** - Download [the latest release asset](https://github.com/Iron-Stag-Games/Lync/releases/latest) and extract the binary to wherever is most convenient. It's recommended that you modify your `Path` system environment variable so you can run the tool with simply `lync`.

## Usage
- Run `lync help` to display the list of available arguments.
- The config file (`lync-config.json`) is located beside your Lync installation. It contains several settings which might be necessary to change in order to use Lync. You can also specify whether or not to install updates automatically, and from which repository.
- [Lune](https://github.com/filiptibell/lune) must be installed for offline RBXL builds. You can specify the path to your Lune installation in the config file.

# How does Lync compare to Rojo?

### Legend
| Symbol | Meaning |
|-|-|
| ✔ | Available |
| ❌️ | Unavailable |
| ➖ | Pending / WIP |

### Sync Features
| | Lync | Rojo |
|-|-|-|
| Playtest Sync | ✔ | ❌️ |
| Full Reverse Sync | ❌️ | ➖ |
| Manual Reverse Script Sync | ✔ | ❌️ |
| Server IP Address | ➖ | ✔ |
| Server Port | ✔ | ✔ |
| Multiple Project Serving | ❌️ | ✔ |
| Unsaved Model Warnings | ✔ | ❌️ |
| Patch Viewer | ❌️ | ✔ |

### Project Features
| | Lync | Rojo |
|-|-|-|
| Package Management | ✔ | ❌️ |
| Custom File Downloads | ✔ | ❌️ |
| Automatic Shell Scripts | ➖ | ❌️ |
| Automatic Sourcemap Generation | ✔ | ❌️ |

### Misc Features
| | Lync | Rojo |
|-|-|-|
| Automatic Updates | ✔ | ❌️ |
| Offline Builds | ✔ | ✔ |
| Place to Project Tool | ❌️ | ➖ |

### File Types
| | Lync | Rojo |
|-|-|-|
| `*.Project.JSON` | ✔ | ✔ |
| `*.Model.JSON` | ✔ | ✔ |
| `RBXM`/`RBXMX` | ✔ | ✔ |
| `LUAU`/`LUA` | ✔ | ✔ |
| `Init.LUA` (Anonymous) | ✔ | ✔ |
| `*.Init.LUA` (Named) | ✔ | ❌️ |
| `JSON` | ✔ | ✔ |
| `YAML` | ✔ | ❌️ |
| `TOML` | ✔ | ✔ |
| `XLSX`/`XLS` | ✔ | ❌️ |
| `TXT` | ✔ | ✔ |
| `CSV` ([LocalizationTable](https://create.roblox.com/docs/reference/engine/classes/LocalizationTable)) | ➖ | ✔ |
| `*.Meta.JSON` | ✔ | ✔ |
| `*.Meta.YAML` | ✔ | ❌️ |
| `*.Meta.TOML` | ✔ | ❌️ |

### Roblox Types
| | Lync | Rojo |
|-|-|-|
| Properties | ✔ | ✔ |
| Attributes | ✔ | ✔ |
| Tags | ✔ | ✔ |
| Terrain | ✔ | ✔ |
| Terrain Material Colors | ✔ | ✔ |

### Syntax
| Lync | Rojo |
|-|-|
| [ "Color3.new(...)" ] | [ ... ] |
| $attributes | $properties.Attributes |
| $tags | $properties.{any array} |
| $clearOnSync | $ignoreUnknownInstances |
| Terrain.$terrainRegion | Terrain.$path |
| Terrain.$terrainMaterialColors | Terrain.$path |

> **Warning**
> Complex expressions in property fields may not be supported by other tools, so please avoid doing things like math or calling string functions when releasing packages.
>
> Simple expressions like `Color3.new(0, 0, 0)` are easy for other tools to interpret without using a Luau VM.

# Games made with Lync

- **[ExoTech](https://www.roblox.com/games/7634484468)** - Iron Stag Games
- **[Traitor Town](https://www.roblox.com/games/255236425)** - Traitor Town
- **[RB Battles](https://www.roblox.com/games/5036207802)** - RB Battles Games
- **NDA title** - RB Battles PVP
- **NDA title #1** - Fund For Games
- **NDA title #2** - Fund For Games
- **NDA title** - Purple Toast Productions
