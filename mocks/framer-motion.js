import React from 'react';

const motionOnlyProps = new Set([
  'animate',
  'custom',
  'exit',
  'initial',
  'layout',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
]);

const componentCache = new Map();

const createMotionComponent = (tag) =>
  React.forwardRef(({ children, ...props }, ref) => {
    const cleanProps = {};

    Object.entries(props).forEach(([key, value]) => {
      if (!motionOnlyProps.has(key)) {
        cleanProps[key] = value;
      }
    });

    return React.createElement(tag, { ...cleanProps, ref }, children);
  });

export const AnimatePresence = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const motion = new Proxy(
  {},
  {
    get: (_target, tag) => {
      if (!componentCache.has(tag)) {
        componentCache.set(tag, createMotionComponent(tag));
      }

      return componentCache.get(tag);
    },
  }
);
