import { useState, useEffect } from 'react';
import { Search, Shield, UserX, UserCheck, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase, Profile, Property, Booking, DeletionRequest } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from './ConfirmModal';

type AdminStats = {
  totalUsers: number;
  totalProperties: number;
  totalBookings: number;
  activeUsers: number;
};

type ConfirmAction = {
  type: 'makeAdmin' | 'activate' | 'deactivate' | 'forceDelete';
  userId: string;
  userName?: string;
} | null;

export function AdminView() {
  const { t } = useTranslation();
  const { user, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'properties' | 'bookings' | 'deletionRequests'>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalProperties: 0,
    totalBookings: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [usersData, propertiesData, bookingsData, deletionRequestsData] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase
          .from('properties')
          .select('*')
          // Note: deleted_at filter temporarily removed
          .order('created_at', { ascending: false }),
        supabase.from('bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('deletion_requests').select('*').order('created_at', { ascending: false }),
      ]);

      if (usersData.data) {
        setUsers(usersData.data);
        setStats(prev => ({
          ...prev,
          totalUsers: usersData.data.length,
          activeUsers: usersData.data.filter(u => u.is_active).length,
        }));
      }

      if (propertiesData.data) {
        setProperties(propertiesData.data);
        setStats(prev => ({ ...prev, totalProperties: propertiesData.data.length }));
      }

      if (bookingsData.data) {
        setBookings(bookingsData.data);
        setStats(prev => ({ ...prev, totalBookings: bookingsData.data.length }));
      }

      // Handle deletion_requests - table might not exist if migration not applied
      if (deletionRequestsData.error) {
        // If table doesn't exist (404), just set empty array
        if (deletionRequestsData.error.code === 'PGRST116' || deletionRequestsData.error.message?.includes('404')) {
          console.warn('deletion_requests table not found - migration may not be applied');
          setDeletionRequests([]);
        } else {
          console.error('Error loading deletion requests:', deletionRequestsData.error);
          setDeletionRequests([]);
        }
      } else if (deletionRequestsData.data) {
        setDeletionRequests(deletionRequestsData.data);
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDeletion = async (requestId: string, userId: string) => {
    setActionLoading(true);
    try {
      // Update deletion request status
      const { error: updateError } = await supabase
        .from('deletion_requests')
        .update({
          status: 'approved',
          admin_id: user!.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) {
        // If table doesn't exist (404), show helpful message
        if (updateError.code === 'PGRST116' || updateError.message?.includes('404')) {
          toast.error('Таблица deletion_requests не найдена. Пожалуйста, примените миграцию базы данных.');
          return;
        }
        throw updateError;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error(t('admin.actionFailed', { defaultValue: 'Action failed' }));
        return;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-user-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) toast.error(t('admin.actionFailed', { defaultValue: 'Action failed' }) + ' (403)');
        else toast.error((data as { error?: string }).error || `Error ${res.status}`);
        return;
      }

      toast.success(t('admin.deletionApproved', { defaultValue: 'Deletion request approved, account deleted' }));
      await loadAdminData();
    } catch (error) {
      console.error('Error approving deletion:', error);
      toast.error(error instanceof Error ? error.message : t('admin.actionFailed', { defaultValue: 'Action failed' }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceDeleteUser = async (targetUserId: string) => {
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error(t('admin.actionFailed', { defaultValue: 'Action failed' }));
        return;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-user-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: targetUserId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (res.status === 403) toast.error(t('admin.actionFailed', { defaultValue: 'Action failed' }) + ' (403)');
        else toast.error(data.error || `Error ${res.status}`);
        return;
      }
      toast.success(t('admin.deletionApproved', { defaultValue: 'Deletion request approved, account deleted' }));
      setConfirmAction(null);
      await loadAdminData();
    } catch (error) {
      console.error('Error force-deleting user:', error);
      toast.error(error instanceof Error ? error.message : t('admin.actionFailed', { defaultValue: 'Action failed' }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectDeletion = async (requestId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('deletion_requests')
        .update({
          status: 'rejected',
          admin_id: user!.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) {
        // If table doesn't exist (404), show helpful message
        if (error.code === 'PGRST116' || error.message?.includes('404')) {
          toast.error('Таблица deletion_requests не найдена. Пожалуйста, примените миграцию базы данных.');
          return;
        }
        throw error;
      }

      toast.success(t('admin.deletionRejected', { defaultValue: 'Deletion request rejected' }));
      await loadAdminData();
    } catch (error) {
      console.error('Error rejecting deletion:', error);
      toast.error(error instanceof Error ? error.message : t('admin.actionFailed', { defaultValue: 'Action failed' }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', userId);

      if (error) throw error;

      await supabase.from('admin_actions').insert({
        admin_id: user!.id,
        action_type: 'make_admin',
        target_user_id: userId,
        details: { timestamp: new Date().toISOString() },
      });

      await loadAdminData();
      toast.success(t('admin.userPromoted'));
    } catch (error) {
      console.error('Error making user admin:', error);
      toast.error(t('admin.actionFailed'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      await supabase.from('admin_actions').insert({
        admin_id: user!.id,
        action_type: action,
        target_user_id: userId,
        details: { timestamp: new Date().toISOString() },
      });

      await loadAdminData();
      if (userId === user?.id) {
        await refreshProfile();
      }
      toast.success(currentStatus ? t('admin.userDeactivated') : t('admin.userActivated'));
    } catch (error) {
      console.error(`Error ${action}ing user:`, error);
      toast.error(t('admin.actionFailed'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const getFilteredUsers = () => {
    let filtered = users;
    if (searchTerm) {
      filtered = filtered.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return filtered;
  };

  const getFilteredProperties = () => {
    let filtered = properties;
    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.address?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (selectedUser) {
      filtered = filtered.filter(p => p.owner_id === selectedUser);
    }
    return filtered;
  };

  const getFilteredBookings = () => {
    let filtered = bookings;
    if (searchTerm) {
      filtered = filtered.filter(b =>
        b.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.guest_email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (selectedUser) {
      const userPropertyIds = properties.filter(p => p.owner_id === selectedUser).map(p => p.id);
      filtered = filtered.filter(b => userPropertyIds.includes(b.property_id));
    }
    return filtered;
  };

  const getPaginatedData = <T,>(data: T[]): T[] => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = <T,>(data: T[]): number => {
    return Math.ceil(data.length / itemsPerPage);
  };

  const getUserPropertyCount = (userId: string) => {
    return properties.filter(p => p.owner_id === userId).length;
  };

  const getUserBookingCount = (userId: string) => {
    const userPropertyIds = properties.filter(p => p.owner_id === userId).map(p => p.id);
    return bookings.filter(b => userPropertyIds.includes(b.property_id)).length;
  };

  const renderUsersTable = () => {
    const filteredUsers = getFilteredUsers();
    const paginatedUsers = getPaginatedData(filteredUsers);
    const totalPages = getTotalPages(filteredUsers);

    return (
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Properties</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Bookings</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Registered</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {paginatedUsers.map((profile) => (
                <tr key={profile.id} className="hover:bg-slate-700/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{profile.email || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{profile.full_name || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      profile.role === 'admin' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-600 text-slate-300'
                    }`}>
                      {profile.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      profile.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {profile.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{getUserPropertyCount(profile.id)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{getUserBookingCount(profile.id)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    {profile.role !== 'admin' && (
                      <button
                        onClick={() => setConfirmAction({ type: 'makeAdmin', userId: profile.id, userName: profile.email || profile.full_name || '' })}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs transition-colors disabled:opacity-50"
                      >
                        <Shield className="w-3 h-3" />
                        {t('admin.makeAdmin')}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmAction({
                        type: profile.is_active ? 'deactivate' : 'activate',
                        userId: profile.id,
                        userName: profile.email || profile.full_name || '',
                      })}
                      disabled={actionLoading}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors disabled:opacity-50 ${
                        profile.is_active
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {profile.is_active ? (
                        <>
                          <UserX className="w-3 h-3" />
                          {t('admin.deactivate')}
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3 h-3" />
                          {t('admin.activate')}
                        </>
                      )}
                    </button>
                    {profile.id !== user?.id && (
                      <button
                        onClick={() => setConfirmAction({ type: 'forceDelete', userId: profile.id, userName: profile.email || profile.full_name || '' })}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-slate-600 hover:bg-red-700 text-red-300 hover:text-white rounded text-xs transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('admin.forceDelete', { defaultValue: 'Force delete' })}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderPagination(totalPages)}
      </div>
    );
  };

  const renderPropertiesTable = () => {
    const filteredProperties = getFilteredProperties();
    const paginatedProperties = getPaginatedData(filteredProperties);
    const totalPages = getTotalPages(filteredProperties);

    return (
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Owner</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {paginatedProperties.map((property) => {
                const owner = users.find(u => u.id === property.owner_id);
                return (
                  <tr key={property.id} className="hover:bg-slate-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{property.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{property.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{owner?.email || 'Unknown'}</td>
                    <td className="px-6 py-4 text-sm text-slate-300">{property.address || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {property.base_price} {property.currency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        property.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-600 text-slate-300'
                      }`}>
                        {property.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {new Date(property.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {renderPagination(totalPages)}
      </div>
    );
  };

  const renderDeletionRequestsTable = () => {
    const pendingRequests = deletionRequests.filter(r => r.status === 'pending');
    const processedRequests = deletionRequests.filter(r => r.status !== 'pending');
    const allRequests = [...pendingRequests, ...processedRequests];

    if (allRequests.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400">
          {t('admin.deletionRequests', { defaultValue: 'Deletion Requests' })} не найдены
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="pb-3 text-sm font-medium text-slate-300">User Email</th>
              <th className="pb-3 text-sm font-medium text-slate-300">Reason</th>
              <th className="pb-3 text-sm font-medium text-slate-300">Status</th>
              <th className="pb-3 text-sm font-medium text-slate-300">Created</th>
              <th className="pb-3 text-sm font-medium text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allRequests.map((request) => {
              const requestUser = users.find(u => u.id === request.user_id);
              return (
                <tr key={request.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-sm text-white">{requestUser?.email || request.user_id}</td>
                  <td className="py-3 text-sm text-slate-300">{request.reason || '—'}</td>
                  <td className="py-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      request.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      request.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-slate-400">
                    {new Date(request.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-sm">
                    {request.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveDeletion(request.id, request.user_id)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors disabled:opacity-50"
                        >
                          {t('admin.approve', { defaultValue: 'Approve' })}
                        </button>
                        <button
                          onClick={() => handleRejectDeletion(request.id)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors disabled:opacity-50"
                        >
                          {t('admin.reject', { defaultValue: 'Reject' })}
                        </button>
                      </div>
                    )}
                    {request.status !== 'pending' && (
                      <span className="text-slate-500 text-xs">
                        {request.processed_at ? new Date(request.processed_at).toLocaleDateString() : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderBookingsTable = () => {
    const filteredBookings = getFilteredBookings();
    const paginatedBookings = getPaginatedData(filteredBookings);
    const totalPages = getTotalPages(filteredBookings);

    return (
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Guest</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Property</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Check-in</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Check-out</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {paginatedBookings.map((booking) => {
                const property = properties.find(p => p.id === booking.property_id);
                return (
                  <tr key={booking.id} className="hover:bg-slate-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{booking.guest_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{property?.name || 'Unknown'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {new Date(booking.check_in).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {new Date(booking.check_out).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {booking.total_price} {booking.currency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        booking.status === 'confirmed' ? 'bg-blue-500/20 text-blue-400' :
                        booking.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{booking.source}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {new Date(booking.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {renderPagination(totalPages)}
      </div>
    );
  };

  const renderPagination = (totalPages: number) => {
    if (totalPages <= 1) return null;

    return (
      <div className="bg-slate-700 px-6 py-4 flex items-center justify-between border-t border-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">Items per page:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-3 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="p-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Loading admin data...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-slate-400">Manage users, properties, and bookings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Total Users</div>
            <div className="text-2xl font-bold text-white">{stats.totalUsers}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Active Users</div>
            <div className="text-2xl font-bold text-green-400">{stats.activeUsers}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Total Properties</div>
            <div className="text-2xl font-bold text-white">{stats.totalProperties}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Total Bookings</div>
            <div className="text-2xl font-bold text-white">{stats.totalBookings}</div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 mb-6">
          <div className="border-b border-slate-700">
            <nav className="flex">
              <button
                onClick={() => {
                  setActiveTab('users');
                  setCurrentPage(1);
                  setSearchTerm('');
                  setSelectedUser(null);
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-slate-700 text-white border-b-2 border-teal-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Users
              </button>
              <button
                onClick={() => {
                  setActiveTab('properties');
                  setCurrentPage(1);
                  setSearchTerm('');
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'properties'
                    ? 'bg-slate-700 text-white border-b-2 border-teal-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Properties
              </button>
              <button
                onClick={() => {
                  setActiveTab('bookings');
                  setCurrentPage(1);
                  setSearchTerm('');
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'bookings'
                    ? 'bg-slate-700 text-white border-b-2 border-teal-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bookings
              </button>
              <button
                onClick={() => {
                  setActiveTab('deletionRequests');
                  setCurrentPage(1);
                  setSearchTerm('');
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'deletionRequests'
                    ? 'bg-slate-700 text-white border-b-2 border-teal-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t('admin.deletionRequests', { defaultValue: 'Deletion Requests' })}
                {deletionRequests.filter(r => r.status === 'pending').length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {deletionRequests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          <div className="p-6">
            <div className="flex gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {(activeTab === 'properties' || activeTab === 'bookings') && (
                <select
                  value={selectedUser || ''}
                  onChange={(e) => {
                    setSelectedUser(e.target.value || null);
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="">All Users</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.email || 'Unknown'}</option>
                  ))}
                </select>
              )}
            </div>

            {activeTab === 'users' && renderUsersTable()}
            {activeTab === 'properties' && renderPropertiesTable()}
            {activeTab === 'bookings' && renderBookingsTable()}
            {activeTab === 'deletionRequests' && renderDeletionRequestsTable()}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmAction !== null}
        onClose={() => !actionLoading && setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.type === 'makeAdmin') {
            handleMakeAdmin(confirmAction.userId);
          } else if (confirmAction?.type === 'activate') {
            handleToggleUserStatus(confirmAction.userId, false);
          } else if (confirmAction?.type === 'deactivate') {
            handleToggleUserStatus(confirmAction.userId, true);
          } else if (confirmAction?.type === 'forceDelete') {
            handleForceDeleteUser(confirmAction.userId);
          }
        }}
        title={
          confirmAction?.type === 'makeAdmin'
            ? t('admin.makeAdmin')
            : confirmAction?.type === 'activate'
              ? t('admin.activate')
              : confirmAction?.type === 'deactivate'
                ? t('admin.deactivate')
                : confirmAction?.type === 'forceDelete'
                  ? t('admin.forceDelete', { defaultValue: 'Force delete user' })
                  : ''
        }
        message={
          confirmAction?.type === 'makeAdmin'
            ? t('admin.confirmMakeAdmin')
            : confirmAction?.type === 'activate'
              ? t('admin.confirmActivate')
              : confirmAction?.type === 'deactivate'
                ? t('admin.confirmDeactivate')
                : confirmAction?.type === 'forceDelete'
                  ? t('admin.confirmForceDelete', {
                      defaultValue: 'Permanently delete this user and all their data (properties, bookings, guests, chats)? This cannot be undone.',
                    })
                  : ''
        }
        variant={confirmAction?.type === 'deactivate' || confirmAction?.type === 'forceDelete' ? 'danger' : 'info'}
        loading={actionLoading}
      />
    </div>
  );
}
