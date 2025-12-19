import { useState, useEffect } from 'react';
import { Modal, InputNumber, Button } from 'antd';
import { useTranslation } from 'react-i18next';

interface MinStayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (minStay: number) => Promise<void>;
  propertyId: string;
  startDate: string;
  endDate: string;
  currentMinStay: number;
}

export function MinStayModal({
  isOpen,
  onClose,
  onSave,
  startDate,
  endDate,
  currentMinStay,
}: MinStayModalProps) {
  const { t } = useTranslation();
  const [minStay, setMinStay] = useState<number>(currentMinStay);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMinStay(currentMinStay);
    }
  }, [isOpen, currentMinStay]);

  const handleSave = async () => {
    if (minStay < 1) {
      return;
    }

    setLoading(true);
    try {
      await onSave(minStay);
    } catch (error) {
      console.error('Error saving min stay:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Минимальный срок бронирования"
      open={isOpen}
      onCancel={onClose}
      onOk={handleSave}
      okText="Сохранить и продолжить"
      cancelText="Отмена"
      confirmLoading={loading}
    >
      <div className="py-4">
        <div className="mb-4">
          <p className="text-sm text-slate-300 mb-2">
            Период: {startDate} - {endDate}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Минимальный срок бронирования (ночей)
          </label>
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            value={minStay}
            onChange={(value) => setMinStay(value !== null && value !== undefined ? value : 1)}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}

