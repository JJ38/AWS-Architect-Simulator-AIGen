# AWS Architect Simulator (AIGen)

A visual AWS architecture editor: drag-and-drop nodes and connections onto a
canvas, convert the diagram to/from Terraform, and run a simulation that
estimates monthly cost and capacity for a given steady-state traffic profile.

This repo is a fresh-history snapshot continuation of a separate learning
project, built out with Claude doing most of the implementation directly. See
`CLAUDE.md` for architecture notes and working conventions, and `todo.md` for
the current roadmap and known gaps.

## Getting started

```sh
npm install
npm run dev      # Vite dev server
npm run build    # type-check (tsc -b) + production build
npm run lint      # ESLint
```

## Stack

React + TypeScript + Vite, [@xyflow/react](https://reactflow.dev/) for the
canvas, plain framework-free TS for the simulation engine (`src/Simulation/`).
