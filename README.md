# LastDayLLM — AI-Powered Exam Preparation

> Study smarter. Learn faster. Prepare strategically.
>
> LastDayLLM is an AI-powered study assistant built around **Hydra**, an autonomous exam-strategizing agent. It brings study resources, exam context, and AI-assisted preparation workflows into one application.

## Overview

Preparing for an exam often means working across disconnected resources: lecture notes, syllabi, presentations, past papers, recordings, and scattered hints. LastDayLLM is designed to bring that material into a single AI-assisted preparation workflow.

At its centre is **Hydra**, the AI-agent experience presented through a conversational interface. The product combines resource organisation and exam configuration with AI-oriented study workflows, helping learners make more deliberate use of their preparation time.

This repository contains a full-stack application codebase, not just a model or notebook.

## Product capabilities

### 1. Hydra — the exam-strategizing agent

Hydra is the AI-agent experience at the heart of LastDayLLM. The product is designed to make exam preparation feel like an interactive workflow rather than a collection of disconnected tools. The landing experience includes an agent demonstration and feature showcase.

### 2. Study-resource management

The application includes upload interfaces and resource-handling workflows for common academic material. The codebase references formats including PDF, Word documents, PowerPoint presentations, text files, images, audio, video, and ZIP archives. Actual processing depends on the relevant application integrations and configured services.

### 3. Exam and syllabus organisation

The application includes subject-level organisation, module and topic management, and exam-scope configuration. Exam scope can be configured around an exam type and selected topics, helping structure preparation around the material that matters for a particular assessment.

### 4. Past-paper organisation and analysis

The codebase includes paper-tagging workflows with exam categories such as Term Test 1, Term Test 2, and End Semester, together with year-based organisation. The product interface also surfaces exam-preparation concepts such as paper-pattern analysis, teacher signals, recency, co-occurrence, and question prioritisation.

### 5. Product interface

The frontend includes a dedicated landing experience, interactive agent demonstration, feature showcases, upload and tagging interfaces, and application workflows. The UI uses animated components and a dark visual system with purple accents.

## Technology stack

| Area | Technologies |
|---|---|
| Application framework | Next.js 15, React 19 |
| Language | TypeScript |
| Styling and UI | Tailwind CSS 4, Radix UI, Lucide |
| Motion and visualisation | Motion, Three.js, Mermaid |
| Generative AI SDKs | Google Gen AI, OpenAI |
| Authentication and data | Supabase, Supabase SSR |
| Vector search | Qdrant JS client |
| Background jobs | Trigger.dev |
| Document processing | pdf-parse, pdf-lib, officeparser, JSZip |
| Validation and utilities | Zod, jsonrepair |

The table describes technologies present in the repository's dependencies and configuration. Individual integrations may require credentials and service-side setup.

## Architecture at a glance

1. **User experience:** Next.js and React interfaces for the landing page, agent experience, study-resource workflows, and exam configuration.
2. **Application logic:** TypeScript application code and server-side functionality.
3. **AI capabilities:** Google Gen AI and OpenAI SDK dependencies for generative-AI functionality.
4. **Data and retrieval:** Supabase and Qdrant client integrations.
5. **Asynchronous execution:** Trigger.dev for background task workflows.
6. **Resource processing:** Document and archive-processing libraries for academic material.

The exact runtime flow and service responsibilities depend on individual application modules and environment configuration.

## Getting started

### Prerequisites

- Node.js 20 or later
- npm 10 or later
- Access to the external services used by the application
- Environment variables for the integrations enabled in your setup

### 1. Clone the repository

```bash
git clone https://github.com/ammar-s2004/LastDayLLM.git
cd LastDayLLM
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local environment file named `.env.local`. The repository's Supabase middleware references these variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Other AI, database, storage, and background-task integrations may require additional credentials. Check the relevant integration code and service configuration before running the complete application.

**Never commit `.env.local`, API keys, service-role keys, database credentials, or other secrets.**

### 4. Run the development environment

Start the Next.js application:

```bash
npm run dev
```

To start the application and Trigger.dev development process together:

```bash
npm run dev:all
```

The application is served locally at http://localhost:3000.

### 5. Production build

```bash
npm run build
npm run start
```

### Useful scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run dev:trigger` | Start the Trigger.dev development process |
| `npm run dev:all` | Run the app and Trigger.dev together |
| `npm run build` | Build the production application |
| `npm run start` | Start the production server |
| `npm run type-check` | Run TypeScript checks without emitting files |
| `npm run test:gemini` | Run the Gemini model test script |

## Repository structure

- `app/` — Next.js application routes, layouts, and global styles
- `components/` — reusable UI, landing-page sections, and product components
- `trigger/` — Trigger.dev task definitions
- `scripts/` — development and integration scripts
- `middleware.ts` — Supabase session handling
- `trigger.config.ts` — Trigger.dev project and runtime configuration
- `next.config.ts` — Next.js configuration

## Engineering considerations

- **Large uploads:** Next.js Server Actions are configured with a 200 MB body-size limit for document and note uploads.
- **Type safety:** The project uses TypeScript with strict compiler settings.
- **Session handling:** Supabase SSR is used to refresh authentication sessions through middleware.
- **Background execution:** Trigger.dev is configured with a maximum task duration of one hour and retry behaviour.
- **Document tooling:** The dependency set includes parsers and utilities for PDF, office-document, and archive workflows.

## Security and configuration

Before deploying or sharing a public instance:

- Keep credentials in environment variables or a managed secrets store.
- Never expose service-role keys or private API credentials in browser code.
- Review upload validation, file-size limits, and access controls.
- Ensure database policies restrict users to data they are authorised to access.
- Review the configuration and deployment requirements of each external service.

Do not use real credentials in screenshots, examples, commits, or issue reports.

## Current scope and limitations

LastDayLLM is an evolving application. Some features depend on external service configuration, credentials, and background workers. The presence of an SDK or package in the repository does not by itself guarantee that an integration is configured in every environment.

For a working local setup, configure the required services and follow the relevant application code paths.

## Author

**Ammar Suratwala**

Computer Science graduate and MSc Artificial Intelligence and Machine Learning student, interested in building practical AI products and full-stack applications.

- GitHub: [@ammar-s2004](https://github.com/ammar-s2004)

## Acknowledgements

LastDayLLM brings together modern web engineering, generative-AI tooling, document-processing libraries, and asynchronous application infrastructure to explore a more structured and interactive approach to exam preparation.