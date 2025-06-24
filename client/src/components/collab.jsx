import { useEffect, useState } from 'react'

import { firestore } from '../database/config';
import { collection, getDocs } from "@firebase/firestore"

export default function Collab() {
  const [collabs, setCollabs] = useState([]);

  const currentUser = localStorage.getItem("currentUser");
  const collabRef = collection(firestore, "collaboration");

  useEffect(() => {
    const searchDocumentsForCurrentUser = async () => {
      try {
        const querySnapshot = await getDocs(collabRef);
        const newCollabs = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();

          // Check if currentUser is listed in any field value
          Object.values(data).forEach((fieldValue) => {
            if (fieldValue === currentUser) {
              newCollabs.push(doc.id);
            }
          });
        });

        setCollabs((prevCollabs) => [...prevCollabs, ...newCollabs]);
      } catch (error) {
        console.error("Error getting documents:", error);
      }
    };
    searchDocumentsForCurrentUser();
    console.log(collabs)
  }, []);

  return (
    <div>grid_collab</div>
  )
}
