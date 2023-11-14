--@script:client
--@disabled
-- This is a script with a TOML meta file

print(require(script.Parent:WaitForChild("ExampleModule")))

print(require(script.Parent:WaitForChild("ExampleParentModule")))

print(require(script.Parent.ExampleParentModule:WaitForChild("ExampleChildModule")))
