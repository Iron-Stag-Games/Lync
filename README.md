<p align="center"><a href="https://discord.gg/n33vdDr">Join the Iron Stag Games Discord!</a></p>

# What is Lync?

Lync is an alternative to Rojo focused on improving user experience.

This tool is currently provided without any documentation whatsoever! Because the two tools are so similar, please refer to [the Rojo documentation](https://rojo.space/docs/v7/) for the time being.

## Usage

- [Node.js](https://nodejs.org/) must be installed for Lync to run.
- [Lune](https://github.com/filiptibell/lune) must be installed for offline RBXL builds. You can specify the path to your Lune installation in the config file.
- [pkg](https://www.npmjs.com/package/pkg) can be used to package Lync into an executable if desired. In the future, this will be automatically generated on GitHub.

## Config

The [config file](https://github.com/Iron-Stag-Games/Lync/blob/main/Lync/config.json) is located in your Lync installation.

- Windows: `%LOCALAPPDATA%\Roblox\Lync\config.json`
- MacOS: `$HOME/Documents/Roblox/Lync/config.json`

# How does Lync compare to Rojo?

### Pros
- Much faster live sync.
- Designed from the ground up to be compatible with all future Roblox properties.
- Nearly fully compatibile with existing Rojo projects. JSON files, including [the project JSON](https://github.com/Iron-Stag-Games/Lync/blob/main/Sample%20Project/default.project.json) must be changed.
- Mesh loading bug and duplication bug fixed.
- No compilation of Lync necessary - edit and go!

### Cons
- Currently unable to convert RBXL to a Lync project.
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

- [RB Battles](https://www.roblox.com/games/5036207802) - RB Battles Games
- [NDA title #1](https://www.roblox.com/games/8875360163) - Fund For Games
- NDA title #2 - Fund For Games
- NDA title #3 - Fund For Games
- [ExoTech](https://www.roblox.com/games/7634484468) - Iron Stag Games
