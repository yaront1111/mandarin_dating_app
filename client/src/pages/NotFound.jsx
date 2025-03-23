// client/src/pages/NotFound.js
import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center"
      style={{ height: '80vh', textAlign: 'center' }}
    >
      <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>404</h1>
      <p style={{ marginBottom: '24px' }}>
        Oops! The page you're looking for doesn't exist.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Go Home
      </button>
    </div>
  );
};

export default NotFound;
