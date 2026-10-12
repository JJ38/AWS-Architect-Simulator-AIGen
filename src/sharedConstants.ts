// Split out of constants.ts specifically to avoid a circular import:
// constants.ts pulls in every Resource subclass (for resourceContainer), and
// IamFactory.ts (imported by several of those subclasses) needs `effect` -
// importing it from constants.ts created a cycle that happened to resolve
// safely only by luck of module evaluation order, until adding another entry
// point into that cycle turned it into a real "Cannot access before
// initialization" crash. This file has no service-class dependencies, so
// anything here is safe for both sides of that cycle to import.

export const regions: string[] = [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "ap-south-1",
    "ap-northeast-3",
    "ap-northeast-2",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "ap-south-1",
    "ap-south-1",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-north-1",
    "sa-east-1"
]

export const effect = ["allow", "deny"]
