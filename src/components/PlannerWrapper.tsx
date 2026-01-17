'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createStore, combineReducers, Store } from 'redux';
import { Provider } from 'react-redux';
import dynamic from 'next/dynamic';

/**
 * Dynamically import react-planner to avoid Next.js SSR issues.
 * react-planner relies on browser-only APIs (window, document) which are
 * not available during server-side rendering.
 */
const ReactPlannerComponent = dynamic(
  () => import('./react-planner-src/index.js').then((mod) => mod.ReactPlanner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Floor Planner...</p>
        </div>
      </div>
    ),
  }
);

interface PlannerWrapperProps {
  width?: number;
  height?: number;
  initialState?: any;
  onStateChange?: (state: any) => void;
}

/**
 * Next.js-compatible wrapper for the react-planner library.
 *
 * This component bridges the gap between react-planner (an older React library)
 * and Next.js 15 by handling Redux store initialization, preventing SSR issues,
 * and managing bidirectional state synchronization.
 *
 * Key Responsibilities:
 * - Initialize Redux store with react-planner reducer in browser environment
 * - Load react-planner modules dynamically to avoid SSR hydration errors
 * - Provide state extraction for react-planner's internal architecture
 * - Synchronize planner state changes back to parent component
 * - Initialize catalog with default architectural elements (walls, doors, etc.)
 *
 * @param width - Canvas width in pixels (default: 800)
 * @param height - Canvas height in pixels (default: 600)
 * @param initialState - Initial react-planner state (from FloorPlanData adapter)
 * @param onStateChange - Callback fired when user modifies the floor plan
 */
export default function PlannerWrapper({
  width = 800,
  height = 600,
  initialState,
  onStateChange,
}: PlannerWrapperProps) {
  const [store, setStore] = useState<Store | null>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [reducer, setReducer] = useState<any>(null);
  const [Plugins, setPlugins] = useState<any>(null);

  /**
   * Initialize Redux store, catalog, and plugins after component mounts.
   * This runs only in the browser to avoid SSR issues.
   */
  useEffect(() => {
    const initializePlanner = async () => {
      try {
        // Lazy-load react-planner modules (client-side only)
        const plannerModule = await import('./react-planner-src/index.js');
        const { reducer: plannerReducer, Catalog, Plugins: PlannerPlugins } = plannerModule;

        // Wrap planner reducer to ensure state initialization
        const reactPlannerReducer = (state: any, action: any) => {
          state = state || {};
          state = plannerReducer(state, action);
          return state;
        };

        // Create root reducer with 'react-planner' namespace
        const rootReducer = combineReducers({
          'react-planner': reactPlannerReducer,
        });

        // Create Redux store with optional DevTools support
        const newStore = createStore(
          rootReducer,
          initialState ? { 'react-planner': initialState } : undefined,
          typeof window !== 'undefined' && (window as any).__REDUX_DEVTOOLS_EXTENSION__
            ? (window as any).__REDUX_DEVTOOLS_EXTENSION__()
            : undefined
        );

        // Initialize empty catalog (can be extended with custom elements)
        const newCatalog = new Catalog();

        setStore(newStore);
        setCatalog(newCatalog);
        setReducer(() => plannerReducer);
        setPlugins(PlannerPlugins);

        // Subscribe to state changes for parent component synchronization
        if (onStateChange) {
          newStore.subscribe(() => {
            const state = newStore.getState();
            onStateChange(state['react-planner']);
          });
        }
      } catch (error) {
        console.error('Failed to initialize react-planner:', error);
      }
    };

    initializePlanner();
  }, [initialState, onStateChange]);

  /**
   * Extract react-planner state from Redux store.
   * react-planner expects its state to be at root level, but we namespace it
   * under 'react-planner' to avoid conflicts with other reducers.
   */
  const stateExtractor = (state: any) => {
    return state['react-planner'] || state;
  };

  // Show loading state until all dependencies are initialized
  if (!store || !catalog || !Plugins) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing Planner...</p>
        </div>
      </div>
    );
  }

  return (
    <Provider store={store}>
      <div className="planner-container" style={{ width, height }}>
        <ReactPlannerComponent
          catalog={catalog}
          width={width}
          height={height}
          stateExtractor={stateExtractor}
          plugins={[
            Plugins.Keyboard(),
            Plugins.Autosave('react-planner_autosave'),
          ]}
        />
      </div>
    </Provider>
  );
}
