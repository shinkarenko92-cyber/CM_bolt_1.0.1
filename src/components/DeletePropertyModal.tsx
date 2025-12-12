import { useState } from 'react';
import { Modal, Table, Button } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Property, Booking } from '../lib/supabase';

interface DeletePropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  bookings: Booking[];
  onConfirm: (action: 'cancel_unpaid' | 'force_delete' | 'abort') => Promise<void>;
}

export function DeletePropertyModal({
  isOpen,
  onClose,
  property,
  bookings,
  onConfirm,
}: DeletePropertyModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'cancel_unpaid' | 'force_delete' | 'abort' | null>(null);

  // Определяем оплаченные и неоплаченные бронирования
  // Неоплаченные: status='pending' или status='cancelled' (не confirmed)
  // Оплаченные: status='confirmed' (предполагаем, что confirmed = оплачено)
  const unpaidBookings = bookings.filter(b => b.status !== 'confirmed');
  const paidBookings = bookings.filter(b => b.status === 'confirmed');

  const handleConfirm = async (action: 'cancel_unpaid' | 'force_delete' | 'abort') => {
    setSelectedAction(action);
    setLoading(true);
    try {
      await onConfirm(action);
      if (action !== 'abort') {
        onClose();
      }
    } catch (error) {
      console.error('Error in DeletePropertyModal:', error);
    } finally {
      setLoading(false);
      setSelectedAction(null);
    }
  };

  const columns = [
    {
      title: t('bookings.guestName', { defaultValue: 'Гость' }),
      dataIndex: 'guest_name',
      key: 'guest_name',
    },
    {
      title: t('bookings.checkIn', { defaultValue: 'Заезд' }),
      dataIndex: 'check_in',
      key: 'check_in',
      render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
    },
    {
      title: t('bookings.checkOut', { defaultValue: 'Выезд' }),
      dataIndex: 'check_out',
      key: 'check_out',
      render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
    },
    {
      title: t('bookings.status', { defaultValue: 'Статус' }),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <span className={`px-2 py-1 text-xs font-medium rounded ${
          status === 'confirmed' ? 'bg-blue-500/20 text-blue-400' :
          status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-red-500/20 text-red-400'
        }`}>
          {status}
        </span>
      ),
    },
    {
      title: t('bookings.totalPrice', { defaultValue: 'Цена' }),
      dataIndex: 'total_price',
      key: 'total_price',
      render: (price: number, record: Booking) => `${price} ${record.currency}`,
    },
  ];

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      title={
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-red-500" />
          <span>{t('properties.deleteProperty', { defaultValue: 'Удаление объекта' })}: {property.name}</span>
        </div>
      }
      footer={null}
      width={800}
      maskClosable={false}
    >
      <div className="py-4">
        <p className="text-slate-300 mb-4">
          {t('properties.deletePropertyWarning', {
            defaultValue: 'У объекта "{propertyName}" есть {count} бронирований. Выберите действие:',
            propertyName: property.name,
            count: bookings.length,
          })}
        </p>

        {paidBookings.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
            <p className="text-yellow-400 text-sm">
              {t('properties.paidBookingsWarning', {
                defaultValue: 'Внимание: {count} бронирований оплачены. При удалении потребуется вернуть деньги вручную.',
                count: paidBookings.length,
              })}
            </p>
          </div>
        )}

        <Table
          dataSource={bookings}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          className="mb-4"
          scroll={{ y: 300 }}
        />

        <div className="flex gap-3 justify-end mt-6">
          <Button onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          
          {unpaidBookings.length > 0 && (
            <Button
              type="default"
              danger
              onClick={() => handleConfirm('cancel_unpaid')}
              loading={loading && selectedAction === 'cancel_unpaid'}
              disabled={loading && selectedAction !== 'cancel_unpaid'}
            >
              {t('properties.cancelUnpaid', {
                defaultValue: 'Отменить неоплаченные ({count})',
                count: unpaidBookings.length,
              })}
            </Button>
          )}

          <Button
            type="primary"
            danger
            onClick={() => handleConfirm('force_delete')}
            loading={loading && selectedAction === 'force_delete'}
            disabled={loading && selectedAction !== 'force_delete'}
          >
            {t('properties.forceDeleteAll', {
              defaultValue: 'Форсированно удалить всё ({count})',
              count: bookings.length,
            })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

