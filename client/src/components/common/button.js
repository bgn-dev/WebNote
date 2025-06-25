import React from 'react';

const Button = ({ 
  children, 
  onClick, 
  className = '', 
  variant = 'primary',
  active = false,
  ...props 
}) => {
  const baseClasses = "shrink-0 rounded border-0 shadow-lg text-sm px-6 py-2 cursor-pointer transition-all duration-300";
  
  const variants = {
    primary: "bg-white text-black hover:bg-slate-800 hover:text-yellow-200",
    active: "bg-slate-800 text-yellow-200",
  };
  
  const buttonClasses = `${baseClasses} ${active ? variants.active : variants.primary} ${className}`;
  
  return (
    <button 
      className={buttonClasses} 
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;