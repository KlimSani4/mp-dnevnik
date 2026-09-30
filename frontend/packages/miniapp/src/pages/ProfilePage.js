import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser, useLogout, useApi } from '@nexora/shared';
import { useTelegramWebApp } from '../telegram/useTelegramWebApp';
export function ProfilePage() {
    const { data: user, isLoading } = useCurrentUser();
    const logout = useLogout();
    const { webApp } = useTelegramWebApp();
    const api = useApi();
    const queryClient = useQueryClient();
    const tgUser = webApp?.initDataUnsafe.user;
    const avatarUrl = tgUser
        ? `https://t.me/i/userpic/320/${tgUser.username}`
        : null;
    const [notificationsEnabled, setNotificationsEnabled] = useState(user?.settings?.notifications ?? true);
    const updateSettings = useMutation({
        mutationFn: (notifications) => api.users.updateMe({ settings: { notifications } }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
        },
    });
    const handleToggleNotifications = () => {
        const next = !notificationsEnabled;
        setNotificationsEnabled(next);
        updateSettings.mutate(next);
    };
    const handleLogout = () => {
        logout.mutate();
    };
    if (isLoading) {
        return (_jsx("div", { style: { padding: '16px 12px' }, children: _jsxs("div", { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 32,
                    gap: 12,
                }, children: [_jsx("div", { style: {
                            width: 72,
                            height: 72,
                            borderRadius: '50%',
                            background: 'var(--tg-theme-secondary-bg-color)',
                            opacity: 0.5,
                        } }), _jsx("div", { style: {
                            height: 18,
                            width: 140,
                            background: 'var(--tg-theme-secondary-bg-color)',
                            borderRadius: 6,
                            opacity: 0.5,
                        } }), _jsx("div", { style: {
                            height: 14,
                            width: 100,
                            background: 'var(--tg-theme-secondary-bg-color)',
                            borderRadius: 6,
                            opacity: 0.5,
                        } })] }) }));
    }
    const displayName = user?.display_name ||
        [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') ||
        'Студент';
    return (_jsxs("div", { style: { padding: '16px 12px' }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 16,
                    paddingBottom: 24,
                }, children: [avatarUrl ? (_jsx("img", { src: avatarUrl, alt: displayName, onError: (e) => {
                            ;
                            e.target.style.display = 'none';
                        }, style: {
                            width: 72,
                            height: 72,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            marginBottom: 12,
                            background: 'var(--tg-theme-secondary-bg-color)',
                        } })) : (_jsx("div", { style: {
                            width: 72,
                            height: 72,
                            borderRadius: '50%',
                            background: 'var(--tg-theme-button-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 12,
                            fontSize: 28,
                            color: 'var(--tg-theme-button-text-color)',
                            fontWeight: 600,
                        }, children: displayName[0]?.toUpperCase() ?? '?' })), _jsx("div", { style: {
                            fontSize: 18,
                            fontWeight: 600,
                            color: 'var(--tg-theme-text-color)',
                            marginBottom: 4,
                        }, children: displayName }), tgUser?.username && (_jsxs("div", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 14 }, children: ["@", tgUser.username] }))] }), _jsxs("div", { style: {
                    background: 'var(--tg-theme-secondary-bg-color)',
                    borderRadius: 12,
                    marginBottom: 12,
                    overflow: 'hidden',
                }, children: [_jsx("div", { style: {
                            padding: '10px 14px 6px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--tg-theme-hint-color)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                        }, children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F" }), _jsxs("button", { onClick: handleToggleNotifications, disabled: updateSettings.isPending, style: {
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                        }, children: [_jsx("span", { style: { color: 'var(--tg-theme-text-color)', fontSize: 15 }, children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043E \u043F\u0430\u0440\u0430\u0445" }), _jsx("div", { style: {
                                    width: 48,
                                    height: 28,
                                    borderRadius: 14,
                                    background: notificationsEnabled
                                        ? 'var(--tg-theme-button-color)'
                                        : 'var(--tg-theme-hint-color)',
                                    position: 'relative',
                                    transition: 'background 0.2s',
                                    opacity: updateSettings.isPending ? 0.6 : 1,
                                }, children: _jsx("div", { style: {
                                        position: 'absolute',
                                        top: 3,
                                        left: notificationsEnabled ? 23 : 3,
                                        width: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        background: '#fff',
                                        transition: 'left 0.2s',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    } }) })] })] }), _jsx("div", { style: {
                    background: 'var(--tg-theme-secondary-bg-color)',
                    borderRadius: 12,
                }, children: _jsx("button", { onClick: handleLogout, disabled: logout.isPending, style: {
                        width: '100%',
                        padding: '14px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        fontSize: 15,
                        fontWeight: 500,
                        opacity: logout.isPending ? 0.6 : 1,
                    }, children: logout.isPending ? 'Выход...' : 'Выйти' }) })] }));
}
