import React from 'react';

/** Scrollable screen body. `grid` lays children in the responsive card grid. */
export default function MobileScreen({ children, grid }) {
    return (
        <div className="m-screen">
            {grid ? <div className="m-screen-grid">{children}</div> : children}
        </div>
    );
}
