{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.vim
    pkgs.nix
    pkgs.lua5_1
    pkgs.lua51Packages.luasocket
    pkgs.lua51Packages.luasec
    pkgs.lua51Packages.lua-cjson
    pkgs.busybox
  ];
}

