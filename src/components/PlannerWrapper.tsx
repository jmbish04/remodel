'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createStore, combineReducers, Store } from 'redux';
import { Provider } from 'react-redux';
import dynamic from 'next/dynamic';

// Dynamic import of react-planner to avoid SSR issues
// react-planner uses window and other browser-only APIs
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
 * PlannerWrapper Component
 *
 * A Next.js-compatible wrapper for the react-planner library.
 * Handles Redux store initialization, SSR compatibility, and state management.
 *
 * Features:
 * - Redux store with react-planner reducer
 * - Dynamic import to prevent SSR issues
 * - State extraction and change callbacks
 * - Catalog initialization
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

  // Initialize Redux store and catalog
  useEffect(() => {
    // Dynamically import react-planner modules (browser-only)
    const initializePlanner = async () => {
      try {
        const plannerModule = await import('./react-planner-src/index.js');

        // Extract necessary exports
        const { reducer: plannerReducer, Catalog, Plugins: PlannerPlugins } = plannerModule;

        // Create Redux store with planner reducer
        const reactPlannerReducer = (state: any, action: any) => {
          state = state || {};
          state = plannerReducer(state, action);
          return state;
        };

        const rootReducer = combineReducers({
          'react-planner': reactPlannerReducer,
        });

        const newStore = createStore(
          rootReducer,
          initialState ? { 'react-planner': initialState } : undefined,
          // Enable Redux DevTools if available
          typeof window !== 'undefined' && (window as any).__REDUX_DEVTOOLS_EXTENSION__
            ? (window as any).__REDUX_DEVTOOLS_EXTENSION__()
            : undefined
        );

        // Initialize catalog with default elements
        const newCatalog = new Catalog();

        setStore(newStore);
        setCatalog(newCatalog);
        setReducer(() => plannerReducer);
        setPlugins(PlannerPlugins);

        // Subscribe to store changes
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

  // State extractor function for ReactPlanner
  const stateExtractor = (state: any) => {
    return state['react-planner'] || state;
  };

  // Don't render until store is initialized
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
