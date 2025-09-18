// swift-tools-version: 6.1
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

 let package = Package(
     name: "Bstd", // Your package name
     products: [
         .library(
             name: "Bstd",
             targets: ["Bstd"]),
     ],
     targets: [
         .target(
             name: "Bstd", // Your main library target
             dependencies: []),
         .testTarget(
             name: "BstdTests", // Your test target
             dependencies: ["Bstd"]), // <-- This links your tests to your library
     ]
 )