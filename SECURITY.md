# Security

## What is in scope

Fewturns is a set of instructions and one local script. The script reads Claude Code's configuration files under your home folder and the current project, and prints a report. It is meant to do nothing else.

A security problem is anything in this repository that could make it do more than that: reach the network, write or delete a file, start a process, or lead an agent that follows `SKILL.md`, `LEVERS.md`, `RULES.md` or `STUB.md` to do something the user did not ask for. An instruction that would weaken a user's settings without telling them counts too.

## Supported versions

The latest release is supported. It is always the tip of `main`: a fix is released the moment it is merged.

## Reporting a problem

Please do not open a public issue. Report it privately through GitHub's [private vulnerability reporting](https://github.com/makavli/fewturns/security/advisories/new) for this repository, with what you found, how to reproduce it and what it could let someone do.

## Installing safely

Install Fewturns only from `makavli/fewturns` on GitHub. It ships text files only: no executables, no hooks, no install script. A copy that carries any of those is not this project.
