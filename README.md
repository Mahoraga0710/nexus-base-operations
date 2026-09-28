# Nexus Foundation

Build the initial foundation for a web application called NEXUS.

NEXUS is an AI-powered client and project operations platform for a software company.

For this first phase, implement only:

Authentication

User accounts

Three user roles:

Admin

Employee

Client

A responsive application shell with:

Sidebar navigation

Top navigation bar

User profile menu

Notification icon

Dashboard page

Database schema for:

users

clients

projects

tasks

comments

activity_events

notifications

Proper relationships between these entities.

Role-based access control.

Do not build the AI functionality yet.

Do not create fake functionality that appears to work without persistence.

All important data should be stored in the database.

The application should be structured so that additional features can be added later, including Kanban task management, client portals, file management, project activity timelines, and AI-assisted requirement analysis.

Before implementing anything, explain the proposed database schema and relationships so they can be reviewed.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aab84ef0-4b5d-47cb-a9ab-85de862b9a6e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
