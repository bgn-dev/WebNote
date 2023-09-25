# Webnote

[![Bildschirmfoto-2023-08-24-um-18-04-49.png](https://i.postimg.cc/6qm2xq8S/Bildschirmfoto-2023-08-24-um-18-04-49.png)](https://postimg.cc/xNLTK0yy)

🎉 This project allows users to take notes in real time in a text editor. 🎉

## Features include

- Unique, randomly generated token for identification
- User can create a note
- User can invite other users into the note
- Notes are distinguished between shared and non-shared notes
- Current mode can be changed via the UI

## Architecture

The project uses React/JavaScript on the frontend and Flask on the backend.  
The database is built using a real-time database Firestore.
Notes are synchronised between frontend and database

### To run this app as localhost
Change the routes in the frontend to `http://localhost:3000/desired_route`.  
Strat the flask server with `flask run`.

### For any changes
Run `npm run start` inside the client folder, but before saving your local changes.  
For the deployment, you will need to run `npm run build`, so that the flas server has access to the latest build.

