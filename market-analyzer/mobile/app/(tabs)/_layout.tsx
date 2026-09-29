import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/theme';

/*
  Bottom tabs: mismas 5 secciones que ya usa la bottom nav de la web
  (public/shared/sidebar.js) — Inicio/Analyzer/Trading/Picks/Perfil.
  Wallet Tracker y Copy Trading se quedan fuera a propósito (misma
  decisión ya validada en la web: se llega a ellas desde las tarjetas
  de Inicio, para no saturar la barra inferior con 7 accesos).
*/
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="analyzer"
        options={{
          title: 'Analyzer',
          tabBarIcon: ({ color, size }) => <Feather name="cpu" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trading"
        options={{
          title: 'Trading',
          tabBarIcon: ({ color, size }) => <Feather name="trending-up" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="picks"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, size }) => <Feather name="search" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
