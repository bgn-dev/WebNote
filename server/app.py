from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS, cross_origin # comment out in deployment
import os, secrets, string
import firebase_admin
from firebase_admin import credentials, firestore

from linked_list import LinkedList

# Create an instance of the LinkedList for the text
richtext = LinkedList()

app = Flask(__name__, static_url_path='/', static_folder= "../client/build") # assign the frontend to the backend

# ADD THESE LINES HERE for development:
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # Disable static file caching
app.config['TEMPLATES_AUTO_RELOAD'] = True   # Auto-reload templates
app.config['DEBUG'] = True  # Enable debug mode

CORS(app)

# database configuration
cred = credentials.Certificate(os.getcwd() + "/key.json") # use for localhost
#cred = credentials.Certificate(os.getcwd() + "/server/key.json") # use for deployment
firebase_admin.initialize_app(cred)
db = firestore.client()

predecessor_len = 0



@app.route("/", defaults={'path':''}) # This catches the root path
@app.route("/<string:path>") # This catches a single URL segment (portion between slashes)
@app.route("/<path:path>") # This catches the entire URL path
def serve(path):
    return send_from_directory(app.static_folder,'index.html') # return frontend

@app.route('/registrate', methods=['POST'])
@cross_origin() 
def registerToken(): 
    data = request.get_json()
    doc_ref = db.collection(u'users').document(u'' + data.get('id'))
    doc_ref.set(data)
    return jsonify(data)

@app.route('/authenticate', methods=['POST'])
@cross_origin() 
def authenticate():
    data = request.get_json()
    doc_ref = db.collection(u'users').document(u'' + data.get('id'))
    doc = doc_ref.get()
    if (doc.get('id') == data.get('id')):
        return jsonify(data)
    return None

@app.route('/generateToken', methods=['POST'])
@cross_origin() 
def generateToken(): 
    token = request.get_json()
    characters = string.ascii_letters + string.digits + '.,-*_'
    token = ''.join(secrets.choice(characters) for _ in range(16))
    doc_ref = db.collection("collectionName").document(token)
    doc = doc_ref.get()
    if doc.exists:
        generateToken()
    else:
        return jsonify(token)
    
@app.route('/sync', methods=['POST'])
@cross_origin() 
def inputOperation(): 
    global predecessor_len
    successor_len = predecessor_len

    operation = request.get_json()
    predecessor_len = operation.get("length")
    print(operation)
    if successor_len < predecessor_len:
        return insert(operation)
    else:
        return delete()

def insert(operation):
    #richtext.insert(operation.get("character"), operation.get("opID"), "0@a")  
    #richtext.display()
    return "insert"

def delete():
    return "delete"