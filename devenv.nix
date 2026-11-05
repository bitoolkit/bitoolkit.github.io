{ inputs, lib, pkgs, ... }:

{
  imports = [
    (inputs.ray-devenv + "/profiles/config.nix")
    (inputs.ray-devenv + "/profiles/frontend.nix")
  ]
  ++ lib.optional (builtins.pathExists ./devenv.local.nix) ./devenv.local.nix;

  languages.javascript = {
    package = pkgs.nodejs_24;
    corepack.enable = lib.mkForce false;
  };
}
