---
name: Deploy an app or framework
description: Playbook for answering "how do I deploy X" questions (Next.js, Remix, Rails, Django, Vite, Astro, static sites, APIs, workers, Lambda). Maps frameworks to Ravion modules and produces a complete answer with ravion.yaml project config, pipeline config, and CLI setup steps. Use for any question about deploying, hosting, or shipping an app on Ravion.
---

# Deploying an app on Ravion

A complete deployment answer has three parts. Give all three unless the user asked about only one:

1. **Project config** (`ravion.yaml`) — the infrastructure modules
2. **Pipeline config** (`ravion-pipeline.yaml`) — build + deploy steps with a git push trigger
3. **CLI steps** to create and apply both

## Step 1: Pick the right module for the app

| App type | Modules needed |
|---|---|
| Server-rendered web app with static assets (Next.js SSR, TanStack Start, Remix, Rails, Django, Express, any HTTP server that serves JS, images, CSS, or pages worth caching) | `rvn-aws-network` + `rvn-ecs-cluster` + `rvn-ecs-web` + `rvn-cloudfront` |
| API-only service with no static assets or cacheable pages | `rvn-aws-network` + `rvn-ecs-cluster` + `rvn-ecs-web` |
| Static site (TanStack Router with Vite, Vite/React SPA, Astro, Hugo, Next.js `output: 'export'`, docs) | `rvn-aws-static` only — no VPC or cluster needed |
| Background worker / queue consumer | `rvn-ecs-worker` (needs cluster; often shares the web app's image) |
| Event handler or lightweight function-URL API | `rvn-lambda` |

**Clarifying questions** — ask one short question (or cover both paths briefly) only when the answer genuinely diverges:

- Next.js: always assume SSR on ECS with CloudFront (`rvn-aws-network` + `rvn-ecs-cluster` + `rvn-ecs-web` + `rvn-cloudfront`) — do not ask about static export. Only use `rvn-aws-static` for Next.js if the user explicitly says they use `output: 'export'`.
- TanStack: **TanStack Start** (full-stack, server functions) → SSR on ECS. **TanStack Router with Vite** (client-only SPA) → `rvn-aws-static` with `routing: spa` and `output_directory: dist`. If the user just says "TanStack", ask which one.
- Greenfield vs existing environment: if they already have a `rvn-aws-network` + `rvn-ecs-cluster`, only add the `rvn-ecs-web` instance and `rvn-cloudfront` when the app has static assets or cacheable pages. Reference the existing cluster by `moduleGivenIdRef`.
- Reasonable defaults you can assume without asking: Dockerfile build (or Railpack if no Dockerfile), `container_port` matching the framework default (Next.js: 3000), `health_check_path: /`, single production environment. State your assumptions.

## Step 2: Project config (`ravion.yaml`)

Retrieve `/config-as-code/project-config-file` and adapt its example config (VPC + ECS cluster + web service — the base shape needed for an SSR app). For web apps with static assets, JS, images, CSS, or cacheable pages, add `rvn-cloudfront` in front of the web service. Adapt it to the user's scenario:

- Replace `givenId`/`name` values and `source_repo` with the user's details.
- Set `container_port` to the framework default (Next.js: 3000) and `health_check_path` appropriately.
- Use the latest module `version` values from the catalog pages (`/module-definitions/catalog/*`) — they always reflect the latest release — not whatever the example happens to pin.
- For any web app with static assets, retrieve `/module-definitions/catalog/rvn-cloudfront` and include a `rvn-cloudfront` instance so JS, images, CSS, and cacheable pages are served through the CDN.
- If the user already has a network + cluster, include only the new `rvn-ecs-web` instance referencing the existing cluster via `moduleGivenIdRef`, plus `rvn-cloudfront` when the app has static assets or cacheable pages.

For a **static site**, a single `rvn-aws-static` instance replaces all three modules — retrieve `/module-definitions/catalog/rvn-aws-static` for inputs. Key ones: `aws_account_id`, `aws_region`, `name`, `routing` (`spa` for client routers, `filesystem` for Astro/Hugo/Next static export), `build_type`, `source_repo`, `output_directory` (Next export: `out`; Vite: `dist`). Custom domains need `distribution_aliases` + a us-east-1 ACM certificate ARN.

The catalog pages and `ravion module schema <module-type>` are the source of truth for inputs; never invent inputs. Cite `/config-as-code/project-config-file` and the relevant catalog page, including `/module-definitions/catalog/rvn-cloudfront` when CloudFront is included.

## Step 3: Pipeline config (`ravion-pipeline.yaml`)

Retrieve `/config-as-code/pipeline-config-file` and adapt its example (GitHub push trigger → build step → deploy step). `/pipelines/examples` has more complete variations (parallel builds, one image feeding multiple deploys). Adapt the trigger `repo`, branch `filter`, variant IDs, and `module_instance` references to the user's project.

Notes:

- `module_instance` is `environmentGivenId.moduleGivenId`; `<< pipeline.variant.id >>` keys it per variant. Variant IDs must match environment `givenId`s — one pipeline with variants, never per-environment pipelines.
- For `rvn-ecs-web`/`rvn-ecs-worker`: build takes `branch`/`ref`, outputs `image_digest`; deploy takes `image_ref`.
- Static and Lambda deploys follow the same build → deploy shape with module-specific inputs; check `/pipelines/step-types` and `/pipelines/examples`.
- Ravion pipelines are optional: existing GitHub Actions/CircleCI can build and then call `ravion deploy create --module-instance-id <id>`.

Cite `/config-as-code/pipeline-config-file`, `/concepts/pipelines`, `/pipelines/variants`.

## Step 4: CLI setup steps

```bash
# One-time
ravion login

# Project
ravion project create --given-id my-app --name "My App"
ravion project config pull <project-id> --file ravion.yaml
# ...edit ravion.yaml...
# Already have a config file? Skip `project create` and `project config pull`: apply creates the
# project when it does not exist yet and the file's project.givenId matches the given ID passed here.
ravion project config apply <project-id> --file ravion.yaml --dry-run
ravion project config apply <project-id> --file ravion.yaml   # runs stack pipeline: plan → approval → apply

# Pipeline
ravion pipeline create --given-id deploy --name "Build and deploy" --project-id <project-id>
ravion pipeline config pull <pipeline-id> --file ravion-pipeline.yaml
# ...edit ravion-pipeline.yaml...
ravion pipeline config apply <pipeline-id> --file ravion-pipeline.yaml
```

After that, pushing to the trigger branch builds and deploys automatically. Rollback: `ravion deploy rollback <id>`.

Optionally mention CI-managed config (plan on PR, apply on merge, `RAVION_API_KEY` secret) and cite `/config-as-code/ci-integration`.

## Answer format

- Lead with the module choice and any assumptions you made (build type, port, single production environment).
- Then the two config files, then the CLI steps, each with a doc link.
- Keep the example minimal; point to the module catalog page for scaling, secrets, custom domains, and deployment strategies (`rolling`, `blue_green`, `canary`, `linear`).
