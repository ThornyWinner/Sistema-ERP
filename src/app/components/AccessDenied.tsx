import React from 'react';
import { useNavigate } from 'react-router';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface AccessDeniedProps {
  message?: string;
}

export default function AccessDenied({ 
  message = "No tienes permisos para acceder a esta sección" 
}: AccessDeniedProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
          <ShieldX className="w-8 h-8 text-red-600" />
        </div>
        
        <h2 className="text-2xl font-semibold mb-3">Acceso Denegado</h2>
        
        <p className="text-neutral-600 mb-6">
          {message}
        </p>

        <p className="text-sm text-neutral-500 mb-6">
          Si crees que esto es un error, contacta al administrador del sistema.
        </p>

        <Button 
          onClick={() => navigate('/')}
          className="bg-[#059669] hover:bg-[#047857]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al Dashboard
        </Button>
      </Card>
    </div>
  );
}
