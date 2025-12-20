# WebNote

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://reactjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A real-time collaborative note-taking application built with React and Firebase, enabling simultaneous multi-user document editing and synchronization.

## Features

- **Authentication** - Email/password and Google OAuth integration
- **Real-time Collaboration** - Simultaneous multi-user editing with live synchronization
- **Rich Text Editing** - Full-featured editor with formatting capabilities
- **Note Management** - Personal and shared note organization
- **Responsive Design** - Mobile-first UI with theme support
- **Auto-save** - Automatic change detection and persistence

## Tech Stack

### Frontend
- React 19
- Tailwind CSS
- React Router
- React Quill
- React Toastify

### Backend & Services
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting

### Development & CI/CD
- GitHub Actions
- Jest & React Testing Library

## Installation

### Prerequisites

- Node.js >= 16.x
- npm or yarn
- Firebase account

### Setup

1. Clone the repository
```bash
git clone https://github.com/yourusername/WebNote.git
cd WebNote
```

2. Install dependencies
```bash
cd client
npm install
```

3. Configure environment variables

Create `client/.env`:
```env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

4. Start development server
```bash
npm start
```

Application runs at `http://localhost:3000`

5. Build for production
```bash
npm run build
```

## Firebase Configuration

1. Create a new project in [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication providers (Email/Password, Google)
3. Create a Firestore database
4. Configure security rules for data access control
5. Retrieve web app configuration from Project Settings
6. Add configuration values to `.env` file

## Deployment

Automatic deployment via GitHub Actions on push to `main` branch.

### Required GitHub Secrets
- `REACT_APP_FIREBASE_*` - Firebase configuration values
- `FIREBASE_SERVICE_ACCOUNT_*` - Service account credentials

Pull requests trigger preview deployments automatically.

## Testing
```bash
npm test
```

## Security

- Environment variables for sensitive configuration
- Firebase Security Rules for data access control
- Authentication required for all features
- HTTPS-only communication

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/feature-name`)
3. Commit changes (`git commit -m 'Add feature description'`)
4. Push to branch (`git push origin feature/feature-name`)
5. Submit a Pull Request

## License

Licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE) for details.
