<p align="center"><a href="https://discord.gg/n33vdDr">Join the Iron Stag Games Discord!</a></p>

# What is Lync?

Lync is an alternative to Rojo focused on improving user experience.

This tool is currently provided without any documentation whatsoever! Because the two tools are so similar, please refer to [the Rojo documentation](https://rojo.space/docs/v7/) for the time being.

## Usage

- [Node.js](https://nodejs.org/) must be installed for Lync to run.
- [pkg](https://www.npmjs.com/package/pkg) can be used to package Lync into an executable if desired. In the future, this will be automatically generated on GitHub.

# How does Lync compare to Rojo?

### Pros
- 99% compatibility with existing Rojo projects. JSON files, including [the project JSON](https://github.com/Iron-Stag-Games/Lync/blob/main/Sample Project/default.project.json) must be changed.
- Compatible with all future Roblox properties.
- Mesh loading bug and duplication bug fixed.
- Much faster live sync.
- No compilation necessary.

### Cons
- Not possible to automate publishing. (See [this thread](https://devforum.roblox.com/t/expose-studiopublishservicepublishas-to-pluginsecurity-create-respective-permission/2065965) for a suggested fix)
- Currently unable to build to RBXL because it requires a serializer.
- Currently unable to convert RBXL to a Lync project because it requires a serializer.
- Lack of documentation.

## Features
|                         | Lync | Rojo |
|-------------------------|------|------|
| Server IP               | ✕    | ✓    |
| Build To RBXL           | …    | ✓    |
| RBXL To Lync/Rojo       | …    | ✓    |
| $terrainRegion          | ✓    | ✕    |
| $terrainMaterialColors  | ✓    | ✕    |


## Syntax
| Lync | Rojo |
|-|-|
| $attributes | $properties.Attributes |
| $tags | $properties.{any array} |
| $clearOnSync | $ignoreUnknownInstances |

# Games made with Lync

- [RB Battles](https://www.roblox.com/games/5036207802) - TeraBrite Games
- [NDA title #1](https://www.roblox.com/games/8875360163) - TeraBrite Games
- NDA title #2 - TeraBrite Games
- NDA title #3 - TeraBrite Games
- [ExoTech](https://www.roblox.com/games/7634484468) - Iron Stag Games
