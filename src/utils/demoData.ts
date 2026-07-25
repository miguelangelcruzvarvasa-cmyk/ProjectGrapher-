import type { Repository, ProjectFile } from '../types/topology';

export const DEMO_REPOSITORIES: { repo: Repository; files: ProjectFile[] }[] = [
  {
    repo: {
      id: 'repo_frontend_app',
      name: 'Mobile-Web-Frontend (React)',
      type: 'frontend',
      path: 'Mobile-Web-Frontend',
      fileCount: 4,
      color: '#3b82f6'
    },
    files: [
      {
        id: 'file_fe_1',
        repoId: 'repo_frontend_app',
        repoName: 'Mobile-Web-Frontend (React)',
        name: 'userApi.ts',
        path: 'src/services/userApi.ts',
        ext: '.ts',
        size: 1420,
        role: 'source',
        content: `
import axios from 'axios';

export const fetchUserProfile = async (userId: string) => {
  const response = await axios.get(\`/api/v1/users/\${userId}\`);
  return response.data;
};

export const createOrder = async (orderData: any) => {
  const response = await fetch('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  });
  return response.json();
};
        `
      },
      {
        id: 'file_fe_2',
        repoId: 'repo_frontend_app',
        repoName: 'Mobile-Web-Frontend (React)',
        name: 'UserProfile.tsx',
        path: 'src/components/UserProfile.tsx',
        ext: '.tsx',
        size: 980,
        role: 'source',
        content: `
import React, { useEffect } from 'react';
import { fetchUserProfile } from '../services/userApi';

export const UserProfile = ({ userId }: { userId: string }) => {
  useEffect(() => {
    fetchUserProfile(userId);
  }, [userId]);

  return <div>Perfil de Usuario</div>;
};
        `
      }
    ]
  },
  {
    repo: {
      id: 'repo_backend_api',
      name: 'Core-API-Backend (Laravel)',
      type: 'backend',
      path: 'Core-API-Backend',
      fileCount: 3,
      color: '#10b981'
    },
    files: [
      {
        id: 'file_be_1',
        repoId: 'repo_backend_api',
        repoName: 'Core-API-Backend (Laravel)',
        name: 'api.php',
        path: 'routes/api.php',
        ext: '.php',
        size: 850,
        role: 'source',
        content: `
<?php
use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\UserController;

Route::get('/api/v1/users/{id}', [UserController::class, 'show']);
Route::post('/api/v1/orders', [OrderController::class, 'store']);
        `
      }
    ]
  }
];
