--@script
-- This is a script with a JSON meta file

print(require(script.Parent:WaitForChild("ExampleModule")))

print(require(script.Parent:WaitForChild("ExampleParentModule")))

print(require(script.Parent.ExampleParentModule:WaitForChild("ExampleChildModule")))
