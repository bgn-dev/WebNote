import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { MdOutlineToken } from 'react-icons/md';

import './popup.css';

function Popup() {
  const notify = () => toast('🦄 Wow so easy!', {
    icon:  <MdOutlineToken/>,
  });

  return (
    <div>
      <button onClick={notify}>Notify!</button>
    </div>
  );
}

export default Popup