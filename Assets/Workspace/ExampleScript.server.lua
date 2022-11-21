print("This is a script")

print(require(script.Parent:WaitForChild("ExampleModule")))

print(require(script.Parent:WaitForChild("ExampleParentModule")))

print(require(script.Parent.ExampleParentModule:WaitForChild("ExampleChildModule")))
