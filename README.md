# WebNote

🎉 **WebNote** is a modern, real-time collaborative note-taking application that allows users to create, edit, and share notes seamlessly. 🎉

## ✨ Features

- **🔐 Secure Authentication** - Email/password and Google OAuth sign-in
- **📝 Real-time Collaboration** - Multiple users can edit notes simultaneously
- **🎨 Modern UI** - Clean, responsive design with dark/light themes
- **📁 Note Organization** - Personal and collaborative note management
- **⚡ Live Sync** - Changes are saved and synced automatically
- **📱 Mobile Responsive** - Designed to be responsive 

## 🏗️ Architecture

**Frontend:**
- **React 18** 
- **Tailwind CSS** for styling and responsive design
- **React Router** for client-side navigation
- **React Quill** for rich text editing
- **Firebase SDK** for authentication and real-time database

**Backend & Services:**
- **Firebase Authentication** for user management
- **Cloud Firestore** for real-time document storage
- **Firebase Hosting** for static site deployment

**DevOps:**
- **GitHub Actions** for CI/CD
- **Environment variables** for secure configuration
- **Automated deployments** to Firebase Hosting

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Firebase account

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/WebNote.git
cd WebNote
```

### 2. Install Dependencies
```bash
cd client
npm install
```

### 3. Environment Setup
Create a `.env` file in the `client/` directory:
```bash
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 4. Run Development Server
```bash
npm start
```

The app will be available at `http://localhost:3000`

### 5. Build for Production
```bash
npm run build
```

## 🔧 Firebase Setup

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable Authentication and Firestore

2. **Configure Authentication**
   - Enable Email/Password provider
   - Enable Google provider
   - Add your domain to authorized domains

3. **Set up Firestore**
   - Create a Firestore database
   - Configure security rules as needed

4. **Get Configuration**
   - Go to Project Settings → General
   - Copy your web app configuration
   - Add values to your `.env` file

## 📦 Deployment

The project uses GitHub Actions for automatic deployment to Firebase Hosting:

1. **Set up GitHub Secrets**
   - `REACT_APP_FIREBASE_*` (all Firebase config values)
   - `FIREBASE_SERVICE_ACCOUNT_*` (service account key)

2. **Deploy**
   - Push to `main` branch for production deployment
   - Create pull request for preview deployment

## 🛠️ Key Technologies

- **React 18** - Frontend framework
- **Firebase** - Backend services
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **React Quill** - Rich text editor
- **Lodash** - Utility library
- **React Toastify** - Notifications

## 🔒 Security

- **Environment Variables** - Sensitive configuration is stored securely
- **Firebase Security Rules** - Database access is properly controlled
- **Authentication Required** - All features require user authentication
- **HTTPS Only** - All communications are encrypted

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🎯 Roadmap

- [ ] WebRTC
- [ ] Conflict-free Replicated Data Type

---

**Made with ❤️ using React and Firebase**
