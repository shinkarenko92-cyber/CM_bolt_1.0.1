import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, MapPin } from 'lucide-react';
import { Property } from '../lib/supabase';
import { PropertyModal } from './PropertyModal';
import { getOAuthSuccess, getOAuthError, parseOAuthState } from '../services/avito';

interface PropertiesViewProps {
  properties: Property[];
  onAdd: (property: Omit<Property, 'id' | 'owner_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdate: (id: string, property: Partial<Property>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PropertiesView({ properties, onAdd, onUpdate, onDelete }: PropertiesViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const oauthProcessedRef = useRef(false);

  // Логируем при монтировании компонента
  useEffect(() => {
    console.log('PropertiesView: Component mounted/updated', {
      propertiesCount: properties.length,
      properties: properties.map(p => ({ id: p.id, name: p.name }))
    });
  }, [properties]);

  // Автоматически открываем PropertyModal для property, если есть OAuth callback
  useEffect(() => {
    // Early exit: Check localStorage FIRST before any work
    const oauthSuccess = getOAuthSuccess();
    const oauthError = getOAuthError();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/74454fc7-45ce-477d-906c-20f245bc9847',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PropertiesView.tsx:27',message:'OAuth callback useEffect triggered',data:{propertiesCount:properties.length,hasOAuth:!!(oauthSuccess||oauthError),alreadyProcessed:oauthProcessedRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // If no OAuth callback, exit immediately (no logging needed)
    if (!oauthSuccess && !oauthError) {
      return;
    }

    // If already processed, don't process again
    if (oauthProcessedRef.current) {
      return;
    }

    // Wait for properties to load
    if (properties.length === 0) {
      return;
    }
    
    console.log('PropertiesView: OAuth callback detected', {
      hasSuccess: !!oauthSuccess,
      hasError: !!oauthError,
      propertiesCount: properties.length,
      isModalOpen
    });

    try {
      if (oauthSuccess) {
        const stateData = parseOAuthState(oauthSuccess.state);
        console.log('PropertiesView: Parsed OAuth state', { stateData });
        
        if (stateData) {
          const property = properties.find(p => p.id === stateData.property_id);
          console.log('PropertiesView: Looking for property', {
            propertyId: stateData.property_id,
            found: !!property,
            propertyName: property?.name
          });
          
          if (property && !isModalOpen) {
            console.log('PropertiesView: Opening PropertyModal for property:', property.id, property.name);
            oauthProcessedRef.current = true;
            setSelectedProperty(property);
            setIsModalOpen(true);
          } else if (!property) {
            console.warn('PropertiesView: Property not found for OAuth callback', {
              propertyId: stateData.property_id,
              availableProperties: properties.map(p => ({ id: p.id, name: p.name }))
            });
            oauthProcessedRef.current = true; // Mark as processed even if property not found
          } else if (isModalOpen) {
            console.log('PropertiesView: Modal already open, skipping');
            oauthProcessedRef.current = true;
          }
        } else {
          console.error('PropertiesView: Failed to parse OAuth state', { state: oauthSuccess.state });
          oauthProcessedRef.current = true;
        }
      } else if (oauthError) {
        console.log('PropertiesView: OAuth error detected', {
          error: oauthError.error,
          errorDescription: oauthError.error_description
        });
        oauthProcessedRef.current = true;
      }
    } catch (error) {
      console.error('PropertiesView: Error handling OAuth callback:', error);
      oauthProcessedRef.current = true;
    }
  }, [properties]); // Removed isModalOpen from dependencies - only check when properties change

  const handleAdd = () => {
    setSelectedProperty(null);
    setIsModalOpen(true);
  };

  const handleEdit = (property: Property) => {
    setSelectedProperty(property);
    setIsModalOpen(true);
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Объекты недвижимости</h1>
            <p className="text-slate-400 mt-1">Управление вашими квартирами и отелями</p>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition"
          >
            <Plus size={20} />
            Добавить объект
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg">
            <p className="text-slate-400 mb-4">У вас пока нет объектов недвижимости</p>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition"
            >
              Добавить первый объект
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => (
              <div
                key={property.id}
                className="bg-slate-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-teal-500 transition"
              >
                <div className="h-48 bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
                  <div className="text-white text-6xl font-bold opacity-20">
                    {property.name.charAt(0)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">
                        {property.name}
                      </h3>
                      <span className="inline-block px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                        {property.type}
                      </span>
                    </div>
                    <button
                      onClick={() => handleEdit(property)}
                      className="p-2 hover:bg-slate-700 rounded transition"
                    >
                      <Edit2 size={16} className="text-slate-400" />
                    </button>
                  </div>

                  {property.address && (
                    <div className="flex items-start gap-2 text-sm text-slate-400 mb-3">
                      <MapPin size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{property.address}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700">
                    <div>
                      <div className="text-xs text-slate-500">Цена за ночь</div>
                      <div className="text-white font-semibold">
                        {property.base_price} {property.currency}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Мин. бронь</div>
                      <div className="text-white font-semibold">
                        {property.minimum_booking_days || 1} {property.minimum_booking_days === 1 ? 'ночь' : 'ночей'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Гостей</div>
                      <div className="text-white font-semibold">{property.max_guests}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Спален</div>
                      <div className="text-white font-semibold">{property.bedrooms}</div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="text-xs text-slate-500 mb-1">Статус</div>
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded ${
                        property.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {property.status === 'active' ? 'Активен' : 'Неактивен'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <PropertyModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedProperty(null);
          }}
          property={selectedProperty}
          onSave={async (data) => {
            if (selectedProperty) {
              await onUpdate(selectedProperty.id, data);
            } else {
              await onAdd(data as Omit<Property, 'id' | 'owner_id' | 'created_at' | 'updated_at'>);
            }
            setIsModalOpen(false);
            setSelectedProperty(null);
          }}
          onDelete={async (id) => {
            await onDelete(id);
            setIsModalOpen(false);
            setSelectedProperty(null);
          }}
        />
      </div>
    </div>
  );
}
