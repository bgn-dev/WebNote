import { toast } from 'react-toastify';

export const showToast = {
  success: (message, options = {}) => 
    toast.success(message, {
      autoClose: 2000,
      newestOnTop: true,
      closeOnClick: true,
      pauseOnHover: false,
      draggable: false,
      ...options
    }),

  error: (message, options = {}) => 
    toast.error(message, {
      autoClose: 3000,
      newestOnTop: true,
      closeOnClick: true,
      pauseOnHover: false,
      draggable: false,
      ...options
    }),

  info: (message, options = {}) => 
    toast.info(message, {
      autoClose: 2000,
      newestOnTop: true,
      closeOnClick: true,
      pauseOnHover: false,
      draggable: false,
      ...options
    }),

  warning: (message, options = {}) => 
    toast.warning(message, {
      autoClose: 2500,
      newestOnTop: true,
      closeOnClick: true,
      pauseOnHover: false,
      draggable: false,
      ...options
    })
};