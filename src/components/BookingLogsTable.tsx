// Component for displaying booking logs in a table
import { Table, Tag, Tooltip, Button } from 'antd';
import { Download } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { BookingLog } from '../lib/supabase';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { isDemoExpired } from '../utils/subscriptionLimits';

interface BookingLogsTableProps {
  logs: BookingLog[];
  loading?: boolean;
}

const actionColors: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  created: 'green', // Legacy support
  updated: 'blue', // Legacy support
  deleted: 'red', // Legacy support
  status_changed: 'orange',
};

const actionLabels: Record<string, string> = {
  create: 'Создано',
  update: 'Обновлено',
  delete: 'Удалено',
  created: 'Создано', // Legacy support
  updated: 'Обновлено', // Legacy support
  deleted: 'Удалено', // Legacy support
  status_changed: 'Изменен статус',
};

export function BookingLogsTable({ logs, loading }: BookingLogsTableProps) {
  const { profile } = useAuth();
  const tier = profile?.subscription_tier ?? '';
  const isDemoActive = (tier === 'demo' || tier === 'trial') && profile && !isDemoExpired(profile);
  const canAccessLogs = ['pro', 'business', 'enterprise'].includes(tier) || isDemoActive;

  const exportToCSV = () => {
    if (!canAccessLogs) {
      return;
    }

    const headers = ['Дата', 'Действие', 'Источник', 'Изменения'];
    const rows = logs.map((log) => {
      const timestamp = format(new Date(log.timestamp), 'dd.MM.yyyy HH:mm', { locale: ru });
      const action = actionLabels[log.action] || log.action;
      const source = log.source || 'manual';
      const changes = log.changes_json && Object.keys(log.changes_json).length > 0
        ? Object.entries(log.changes_json)
            .map(([field, change]) => {
              const fieldLabels: Record<string, string> = {
                guest_name: 'Имя гостя',
                guest_email: 'Email',
                guest_phone: 'Телефон',
                check_in: 'Заезд',
                check_out: 'Выезд',
                guests_count: 'Количество гостей',
                total_price: 'Цена',
                currency: 'Валюта',
                status: 'Статус',
                notes: 'Заметки',
                extra_services_amount: 'Доп. услуги',
                property_id: 'Объект',
              };
              const fieldLabel = fieldLabels[field] || field;
              const oldVal = change && change.old !== undefined ? String(change.old) : '—';
              const newVal = change && change.new !== undefined ? String(change.new) : '—';
              return `${fieldLabel}: ${oldVal} → ${newVal}`;
            })
            .join('; ')
        : '—';

      return [timestamp, action, source, changes];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `booking_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const columns: ColumnsType<BookingLog> = [
    {
      title: 'Дата',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      sorter: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      defaultSortOrder: 'descend',
      render: (timestamp: string) => {
        try {
          return format(new Date(timestamp), 'dd.MM.yyyy HH:mm', { locale: ru });
        } catch {
          return timestamp;
        }
      },
    },
    {
      title: 'Пользователь',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 150,
      render: (userId: string | null) => {
        if (!userId) {
          return <span className="text-slate-400">Система</span>;
        }
        // В будущем можно добавить загрузку профилей для отображения имени
        return <span className="text-slate-300">{userId.substring(0, 8)}...</span>;
      },
    },
    {
      title: 'Действие',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string) => (
        <Tag color={actionColors[action] || 'default'}>
          {actionLabels[action] || action}
        </Tag>
      ),
    },
    {
      title: 'Источник',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (source: string | null) => {
        const sourceLabels: Record<string, string> = {
          manual: 'Ручное',
          avito: 'Avito',
          cian: 'ЦИАН',
          booking: 'Booking.com',
          airbnb: 'Airbnb',
        };
        const sourceText = source || 'manual';
        return (
          <Tag>{sourceLabels[sourceText] || sourceText}</Tag>
        );
      },
    },
    {
      title: 'Изменения',
      dataIndex: 'changes_json',
      key: 'changes',
      ellipsis: {
        showTitle: false,
      },
      render: (changes: Record<string, { old?: unknown; new?: unknown }> | null) => {
        if (!changes || Object.keys(changes).length === 0) {
          return <span className="text-slate-400">—</span>;
        }
        
        const changeTexts = Object.entries(changes).map(([field, change]) => {
          const fieldLabels: Record<string, string> = {
            guest_name: 'Имя гостя',
            guest_email: 'Email',
            guest_phone: 'Телефон',
            check_in: 'Заезд',
            check_out: 'Выезд',
            guests_count: 'Количество гостей',
            total_price: 'Цена',
            currency: 'Валюта',
            status: 'Статус',
            notes: 'Заметки',
            extra_services_amount: 'Доп. услуги',
            property_id: 'Объект',
          };
          
          const fieldLabel = fieldLabels[field] || field;
          const oldVal = change && change.old !== undefined ? String(change.old) : '—';
          const newVal = change && change.new !== undefined ? String(change.new) : '—';
          
          return `${fieldLabel}: ${oldVal} → ${newVal}`;
        });
        
        const text = changeTexts.join('; ');
        
        return (
          <Tooltip title={text}>
            <span className="text-slate-300">{text}</span>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <div>
      {canAccessLogs && logs.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button
            type="primary"
            icon={<Download className="w-4 h-4" />}
            onClick={exportToCSV}
          >
            Экспорт CSV
          </Button>
        </div>
      )}
      <Table
        columns={columns}
        dataSource={logs}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `Всего: ${total}`,
        }}
        scroll={{ x: 800 }}
        className="booking-logs-table"
      />
    </div>
  );
}
