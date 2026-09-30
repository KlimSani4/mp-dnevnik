import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { Button, Card, Input, Avatar } from '../components/ui';
import { useCurrentUser, useLogout, useMyGroups, useApi, useSearchGroups, useJoinGroup, useNotificationPreferences, useUpdateNotificationPreferences, useGroupStudents, useVerifyStudent, useChangeStudentRole, } from '@nexora/shared';
const NOTIFICATION_META = [
    { type: 'schedule_change', label: 'Изменения расписания', description: 'Отмена пар, смена аудиторий' },
    { type: 'new_assignment', label: 'Новые задания', description: 'Когда кто-то создаёт задание' },
    { type: 'deadline', label: 'Дедлайны', description: 'Напоминание за день до срока' },
    { type: 'vote', label: 'Голосования', description: 'Новые задания требуют подтверждения' },
    { type: 'digest', label: 'Вечерний дайджест', description: 'Сводка на завтра в 21:00' },
];
export function SettingsPage() {
    const currentUserQuery = useCurrentUser();
    const logoutMutation = useLogout();
    const myGroupsQuery = useMyGroups();
    const joinGroupMutation = useJoinGroup();
    const api = useApi();
    const user = currentUserQuery.data;
    const memberships = myGroupsQuery.data ?? [];
    const [displayName, setDisplayName] = useState('');
    const [savePending, setSavePending] = useState(false);
    const [saveError, setSaveError] = useState(null);
    useEffect(() => {
        if (user?.display_name) {
            setDisplayName(user.display_name);
        }
    }, [user?.display_name]);
    // Group search state
    const [groupSearch, setGroupSearch] = useState('');
    const [debouncedGroupSearch, setDebouncedGroupSearch] = useState('');
    const [joinError, setJoinError] = useState(null);
    const [joinSuccess, setJoinSuccess] = useState(null);
    const debounceRef = useRef(null);
    const handleGroupSearchChange = (value) => {
        setGroupSearch(value);
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedGroupSearch(value);
        }, 400);
    };
    const searchGroupsQuery = useSearchGroups(debouncedGroupSearch.length >= 2 ? { search: debouncedGroupSearch } : undefined);
    const handleJoinGroup = async (code) => {
        setJoinError(null);
        setJoinSuccess(null);
        try {
            await joinGroupMutation.mutateAsync(code);
            setJoinSuccess(`Вы вступили в группу ${code}. Ожидайте подтверждения от старосты.`);
            setGroupSearch('');
            setDebouncedGroupSearch('');
        }
        catch (err) {
            const error = err;
            if (error?.status === 409) {
                setJoinError('Вы уже состоите в этой группе.');
            }
            else {
                setJoinError('Не удалось вступить в группу. Попробуйте позже.');
            }
        }
    };
    const [activeSection, setActiveSection] = useState('profile');
    const prefsQuery = useNotificationPreferences();
    const updatePrefsMutation = useUpdateNotificationPreferences();
    // Merge saved preferences with meta. Missing type => default enabled except digest starts from backend.
    const notifications = useMemo(() => {
        const saved = prefsQuery.data?.preferences ?? [];
        const savedByType = new Map(saved.map((p) => [p.type, p.enabled]));
        return NOTIFICATION_META.map((m) => ({
            ...m,
            enabled: savedByType.has(m.type) ? savedByType.get(m.type) : m.type !== 'vote',
        }));
    }, [prefsQuery.data]);
    const toggleNotification = (type) => {
        const next = notifications.map((n) => n.type === type ? { type: n.type, enabled: !n.enabled } : { type: n.type, enabled: n.enabled });
        updatePrefsMutation.mutate({ preferences: next });
    };
    const handleSaveProfile = async () => {
        setSavePending(true);
        setSaveError(null);
        try {
            await api.users.updateMe({ display_name: displayName });
        }
        catch (err) {
            setSaveError('Не удалось сохранить');
        }
        finally {
            setSavePending(false);
        }
    };
    const handleLogout = () => {
        logoutMutation.mutate();
    };
    const sections = [
        { id: 'profile', label: 'Профиль', icon: UserIcon },
        { id: 'notifications', label: 'Уведомления', icon: BellIcon },
        { id: 'group', label: 'Группа', icon: UsersIcon },
        { id: 'about', label: 'О приложении', icon: InfoIcon },
    ];
    const primaryGroup = memberships[0];
    const isModerator = !!primaryGroup &&
        (primaryGroup.role === 'starosta' || primaryGroup.role === 'deputy' || primaryGroup.role === 'moderator');
    const moderatedGroupCode = isModerator ? primaryGroup.group.code : undefined;
    const groupStudentsQuery = useGroupStudents(moderatedGroupCode);
    const verifyStudentMutation = useVerifyStudent();
    const changeRoleMutation = useChangeStudentRole();
    const handleVerify = (userId) => {
        if (!moderatedGroupCode)
            return;
        verifyStudentMutation.mutate({ code: moderatedGroupCode, userId });
    };
    const handleChangeRole = (userId, role) => {
        if (!moderatedGroupCode)
            return;
        changeRoleMutation.mutate({ code: moderatedGroupCode, userId, role });
    };
    return (_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50 mb-6", children: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" }), _jsxs("div", { className: "flex flex-col md:flex-row gap-6", children: [_jsx("nav", { className: "md:w-56 flex-shrink-0", children: _jsx("div", { className: "flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0", children: sections.map(({ id, label, icon: SIcon }) => (_jsxs("button", { onClick: () => setActiveSection(id), className: clsx('flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap', activeSection === id
                                    ? 'bg-primary-500 text-white'
                                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'), children: [_jsx(SIcon, { className: "w-4 h-4" }), label] }, id))) }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [activeSection === 'profile' && (_jsxs(Card, { padding: "lg", children: [_jsx("h2", { className: "text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6", children: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C" }), currentUserQuery.isLoading ? (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map((i) => (_jsx("div", { className: "h-10 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" }, i))) })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-4 mb-6", children: [_jsx(Avatar, { name: displayName || 'Студент', size: "lg" }), _jsxs("div", { children: [_jsx("div", { className: "font-medium text-surface-900 dark:text-surface-50", children: displayName || 'Студент' }), primaryGroup && (_jsx("div", { className: "text-sm text-surface-500 dark:text-surface-400", children: primaryGroup.group.code }))] })] }), _jsxs("div", { className: "space-y-4", children: [_jsx(Input, { label: "\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0435 \u0438\u043C\u044F", value: displayName, onChange: (e) => setDisplayName(e.target.value) }), saveError && (_jsx("p", { className: "text-sm text-danger-500", children: saveError })), _jsxs("div", { className: "pt-4 flex gap-3", children: [_jsx(Button, { variant: "primary", onClick: handleSaveProfile, disabled: savePending, children: savePending ? 'Сохранение...' : 'Сохранить' }), _jsx(Button, { variant: "ghost", onClick: handleLogout, disabled: logoutMutation.isPending, className: "text-danger-500 hover:text-danger-600", children: "\u0412\u044B\u0439\u0442\u0438" })] })] })] }))] })), activeSection === 'notifications' && (_jsxs(Card, { padding: "lg", children: [_jsx("h2", { className: "text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6", children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F" }), _jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400 mb-6", children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u0445\u043E\u0434\u044F\u0442 \u0432 Telegram-\u0431\u043E\u0442\u0430" }), _jsx("div", { className: "space-y-1", children: notifications.map((n) => (_jsxs("div", { className: "flex items-center justify-between py-3 border-b border-surface-100 dark:border-surface-700 last:border-0", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium text-surface-900 dark:text-surface-50", children: n.label }), _jsx("div", { className: "text-xs text-surface-500 dark:text-surface-400", children: n.description })] }), _jsx("button", { disabled: updatePrefsMutation.isPending, onClick: () => toggleNotification(n.type), className: clsx('relative w-11 h-6 rounded-full transition-colors', n.enabled ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600'), children: _jsx("span", { className: clsx('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', n.enabled ? 'left-[22px]' : 'left-0.5') }) })] }, n.type))) })] })), activeSection === 'group' && (_jsxs(Card, { padding: "lg", children: [_jsx("h2", { className: "text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6", children: "\u0413\u0440\u0443\u043F\u043F\u0430" }), _jsxs("div", { className: "mb-6", children: [_jsx("p", { className: "text-sm font-medium text-surface-700 dark:text-surface-300 mb-3", children: "\u0412\u0430\u0448\u0438 \u0433\u0440\u0443\u043F\u043F\u044B" }), myGroupsQuery.isLoading ? (_jsx("div", { className: "space-y-2", children: [1, 2].map((i) => (_jsx("div", { className: "h-12 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" }, i))) })) : memberships.length === 0 ? (_jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400 py-3", children: "\u0412\u044B \u043D\u0435 \u0441\u043E\u0441\u0442\u043E\u0438\u0442\u0435 \u043D\u0438 \u0432 \u043E\u0434\u043D\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u0435" })) : (_jsx("div", { className: "space-y-1", children: memberships.map((membership) => (_jsxs("div", { className: "flex items-center gap-3 py-2.5 border-b border-surface-100 dark:border-surface-700 last:border-0", children: [_jsx(Avatar, { name: membership.group.code, size: "sm" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium text-surface-900 dark:text-surface-50 truncate", children: membership.group.code }), membership.group.name && (_jsx("div", { className: "text-xs text-surface-500 dark:text-surface-400 truncate", children: membership.group.name }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [membership.role === 'starosta' && (_jsx("span", { className: "text-xs px-2 py-0.5 bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400 rounded-full font-medium", children: "\u0421\u0442\u0430\u0440\u043E\u0441\u0442\u0430" })), membership.role === 'deputy' && (_jsx("span", { className: "text-xs px-2 py-0.5 bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-400 rounded-full font-medium", children: "\u0417\u0430\u043C" })), !membership.verified && (_jsx("span", { className: "text-xs px-2 py-0.5 bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400 rounded-full font-medium", children: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442" }))] })] }, membership.id))) }))] }), _jsxs("div", { className: "pt-4 border-t border-surface-200 dark:border-surface-700", children: [_jsx("p", { className: "text-sm font-medium text-surface-700 dark:text-surface-300 mb-3", children: memberships.length > 0 ? 'Вступить в другую группу' : 'Найти и вступить в группу' }), _jsx(Input, { placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 \u0433\u0440\u0443\u043F\u043F\u044B, \u043D\u0430\u043F\u0440. 221-361", value: groupSearch, onChange: (e) => handleGroupSearchChange(e.target.value) }), joinError && (_jsx("p", { className: "mt-2 text-sm text-danger-500", children: joinError })), joinSuccess && (_jsx("p", { className: "mt-2 text-sm text-success-600 dark:text-success-400", children: joinSuccess })), debouncedGroupSearch.length >= 2 && (_jsx("div", { className: "mt-2 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden", children: searchGroupsQuery.isLoading ? (_jsx("div", { className: "px-4 py-3 text-sm text-surface-500 dark:text-surface-400", children: "\u041F\u043E\u0438\u0441\u043A..." })) : !searchGroupsQuery.data || searchGroupsQuery.data.length === 0 ? (_jsx("div", { className: "px-4 py-3 text-sm text-surface-500 dark:text-surface-400", children: "\u0413\u0440\u0443\u043F\u043F\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" })) : (searchGroupsQuery.data.map((group) => {
                                                    const alreadyMember = memberships.some((m) => m.group.code === group.code);
                                                    return (_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700 last:border-0 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium text-surface-900 dark:text-surface-50", children: group.code }), group.name && (_jsx("div", { className: "text-xs text-surface-500 dark:text-surface-400", children: group.name }))] }), _jsx(Button, { variant: "secondary", size: "sm", disabled: alreadyMember || joinGroupMutation.isPending, onClick: () => handleJoinGroup(group.code), children: alreadyMember ? 'Вы в группе' : 'Вступить' })] }, group.id));
                                                })) }))] }), isModerator && (_jsxs("div", { className: "pt-6 mt-2 border-t border-surface-200 dark:border-surface-700", children: [_jsx("p", { className: "text-sm font-medium text-surface-700 dark:text-surface-300 mb-1", children: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430\u043C\u0438" }), _jsx("p", { className: "text-xs text-surface-500 dark:text-surface-400 mb-4", children: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0445 \u0441\u0442\u0443\u0434\u0435\u043D\u0442\u043E\u0432 \u0438 \u0438\u0437\u043C\u0435\u043D\u044F\u0439\u0442\u0435 \u0438\u0445 \u0440\u043E\u043B\u0438" }), groupStudentsQuery.isLoading ? (_jsx("div", { className: "space-y-2", children: [1, 2, 3].map((i) => (_jsx("div", { className: "h-12 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" }, i))) })) : !groupStudentsQuery.data || groupStudentsQuery.data.length === 0 ? (_jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400 py-2", children: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u043D\u0435\u0442" })) : (_jsx("div", { className: "space-y-1", children: groupStudentsQuery.data.map((student) => {
                                                    const isPending = verifyStudentMutation.isPending || changeRoleMutation.isPending;
                                                    return (_jsxs("div", { className: "flex items-center gap-3 py-2.5 border-b border-surface-100 dark:border-surface-700 last:border-0", children: [_jsx(Avatar, { name: student.user.display_name || student.user_id, size: "sm" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium text-surface-900 dark:text-surface-50 truncate", children: student.user.display_name || 'Студент' }), _jsxs("div", { className: "flex items-center gap-1.5 mt-0.5", children: [student.verified ? (_jsxs("span", { className: "text-xs text-success-600 dark:text-success-400 flex items-center gap-1", children: [_jsx(CheckIcon, { className: "w-3 h-3" }), "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D"] })) : (_jsx("span", { className: "text-xs text-warning-600 dark:text-warning-400", children: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F" })), student.role !== 'student' && (_jsx("span", { className: "text-xs px-1.5 py-0.5 bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400 rounded font-medium capitalize", children: student.role === 'starosta' ? 'Староста' : student.role === 'deputy' ? 'Зам' : student.role === 'moderator' ? 'Модератор' : student.role }))] })] }), _jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [!student.verified && (_jsx(Button, { variant: "secondary", size: "sm", disabled: isPending, onClick: () => handleVerify(student.user_id), children: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C" })), student.role === 'student' && student.verified && (_jsx(Button, { variant: "ghost", size: "sm", disabled: isPending, onClick: () => handleChangeRole(student.user_id, 'moderator'), children: "\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u043E\u043C" })), student.role === 'moderator' && (_jsx(Button, { variant: "ghost", size: "sm", disabled: isPending, onClick: () => handleChangeRole(student.user_id, 'student'), children: "\u0423\u0431\u0440\u0430\u0442\u044C \u0440\u043E\u043B\u044C" }))] })] }, student.id));
                                                }) }))] }))] })), activeSection === 'about' && (_jsxs(Card, { padding: "lg", children: [_jsx("h2", { className: "text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6", children: "\u041E \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-surface-500 dark:text-surface-400", children: "\u0412\u0435\u0440\u0441\u0438\u044F" }), _jsx("span", { className: "text-surface-900 dark:text-surface-50 font-medium", children: "0.1.0-alpha" })] }), _jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-surface-500 dark:text-surface-400", children: "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430" }), _jsx("span", { className: "text-surface-900 dark:text-surface-50 font-medium", children: "Nexora Team" })] }), _jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-surface-500 dark:text-surface-400", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("span", { className: "text-surface-900 dark:text-surface-50 font-medium", children: "rasp.dmami.ru" })] }), _jsx("div", { className: "pt-4 border-t border-surface-200 dark:border-surface-700", children: _jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400", children: "Nexora \u2014 \u0435\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 \u043C\u0435\u0441\u0442\u043E \u043F\u0440\u0430\u0432\u0434\u044B \u043E \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F\u0445 \u0434\u043B\u044F \u0441\u0442\u0443\u0434\u0435\u043D\u0442\u0430 \u041C\u043E\u0441\u043A\u043E\u0432\u0441\u043A\u043E\u0433\u043E \u041F\u043E\u043B\u0438\u0442\u0435\u0445\u0430." }) })] })] }))] })] })] }));
}
/* ─── Mini Icon Components ─── */
function UserIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" }) }));
}
function BellIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" }) }));
}
function UsersIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" }) }));
}
function InfoIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }));
}
function CheckIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4.5 12.75l6 6 9-13.5" }) }));
}
