# Webnote

[![Bildschirmfoto-2023-08-24-um-18-04-49.png](https://i.postimg.cc/6qm2xq8S/Bildschirmfoto-2023-08-24-um-18-04-49.png)](https://postimg.cc/xNLTK0yy)

🎉 This project allows users to take real-time notes in a text editor.

## Features

- Unique token for identification, created randomly
- User is able to create a note
- User is able to invite other users into the note
- Notes are differentiated between shared and non-shared notes
- Current mode is changeable through the UI
- Notes are synchronized between the frontend and database

## Architecture

The project utilizes React/JavaScript on the frontend and Flask on the backend.  
The database is built using a real-time database Firestore.

### How to run this App as localhost
Change routes in the frontend to `http://localhost:3000/desired_route`.  
Run the flask server with `flask run`.

### For any changes
Run `npm run start` inside the client folder, but before saving your local changes.  
For the deployment, you need to run `npm run build`, so the flask server can access the newest build.

