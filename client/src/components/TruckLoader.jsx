import React from 'react';

/**
 * TruckLoader — Animated VGTC SVG Truck Logo from samples/VGTC_ALL_IN_ONE.html
 * Features transparent background, original animation timings, and clean scaling.
 */
export default function TruckLoader({ text, subText, size = 130, overlay = false, className = '', style = {} }) {
  const content = (
    <div
      className={`vgtc-loader-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '20px',
        background: 'transparent',
        ...style
      }}
    >
      <div style={{ width: size, maxWidth: '100%', background: 'transparent' }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="25 430 1205 410"
          role="img"
          aria-label="VGTC animated truck logo"
          style={{ width: '100%', height: 'auto', display: 'block', background: 'transparent' }}
        >
          <defs>
            <linearGradient id="vgtc-navy" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#13263A" />
              <stop offset="0.55" stopColor="#102337" />
              <stop offset="1" stopColor="#0B1C2C" />
            </linearGradient>
            <linearGradient id="vgtc-orange" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#F07A00" />
              <stop offset="1" stopColor="#D96A00" />
            </linearGradient>
            <filter id="vgtc-softShadow" x="-20%" y="-20%" width="140%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".12" />
            </filter>
            <style>{`
              .truck-motion {
                transform-box: fill-box;
                transform-origin: 52% 78%;
                animation: truckBounce 0.68s cubic-bezier(.45,.05,.55,.95) infinite;
                will-change: transform;
              }
              .wheel {
                transform-box: fill-box;
                transform-origin: center;
                animation: wheelSpin 0.34s linear infinite;
                will-change: transform;
              }
              .wheel-mark { animation: none; }
              .wheel-highlight {
                animation: wheelGlint 1.15s ease-in-out infinite;
              }
              .speed {
                transform-box: fill-box;
                transform-origin: right center;
                animation: speedMove .38s cubic-bezier(.15,.75,.25,1) infinite;
                will-change: transform, opacity;
              }
              .speed.s2 { animation-delay: .12s; }
              .speed.s3 { animation-delay: .24s; }
              @keyframes truckBounce {
                0%,100% { transform: translateY(0) rotate(0deg); }
                18% { transform: translateY(-1px) rotate(-0.08deg); }
                38% { transform: translateY(2.7px) rotate(0.16deg); }
                53% { transform: translateY(0.4px) rotate(0.02deg); }
                70% { transform: translateY(-1.8px) rotate(-0.11deg); }
                86% { transform: translateY(.7px) rotate(.05deg); }
              }
              @keyframes wheelSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              @keyframes wheelGlint {
                0%, 55% { opacity: .08; transform: rotate(-18deg); }
                72% { opacity: .32; transform: rotate(18deg); }
                100% { opacity: .08; transform: rotate(54deg); }
              }
              @keyframes speedMove {
                0% { opacity: 0; transform: translateX(24px) scaleX(.45); }
                20% { opacity: .95; }
                70% { opacity: .72; }
                100% { opacity: 0; transform: translateX(-18px) scaleX(1.12); }
              }
              .complete-wheel {
                transform-box: view-box;
                transform-origin: center;
                animation: completeWheelRoll 0.82s linear infinite !important;
              }
              .left-wheel { transform-origin: 344px 770px; animation-delay: -0.08s; }
              .right-wheel { transform-origin: 1003px 770px; animation-delay: -0.41s; }
              @keyframes completeWheelRoll {
                0%   { transform: rotate(0deg); }
                25%  { transform: rotate(90deg); }
                50%  { transform: rotate(180deg); }
                75%  { transform: rotate(270deg); }
                100% { transform: rotate(360deg); }
              }
              .complete-wheel .wheel,
              .complete-wheel .wheel-mark { animation: none !important; }
              @media (prefers-reduced-motion: reduce) {
                .truck-motion,.wheel,.wheel-mark,.speed,.wheel-highlight,.complete-wheel { animation: none !important; }
              }
            `}</style>
          </defs>

          <g className="truck-motion" filter="url(#vgtc-softShadow)">
            <path d="M 1041 553 L 1032 612 L 1147 633 L 1135 568 L 1127 556 L 1119 552 Z M 595 521 L 409 521 L 393 525 L 378 533 L 365 545 L 352 563 L 307 653 L 282 714 L 285 715 L 285 741 L 296 725 L 308 715 L 317 710 L 335 705 L 358 706 L 375 713 L 528 713 L 573 596 L 453 596 L 434 637 L 499 637 L 499 643 L 487 671 L 378 671 L 372 669 L 367 662 L 369 651 L 401 585 L 406 578 L 418 568 L 428 565 L 576 565 Z M 980 513 L 842 513 L 814 519 L 794 531 L 780 545 L 766 566 L 750 599 L 733 641 L 726 666 L 726 684 L 735 702 L 751 711 L 764 713 L 912 713 L 929 668 L 799 668 L 792 665 L 787 658 L 789 642 L 817 580 L 830 566 L 846 560 L 964 560 Z M 1217 660 L 1215 653 L 1211 648 L 1186 640 L 1179 635 L 1163 556 L 1157 541 L 1144 526 L 1116 512 L 1096 507 L 1001 506 L 941 712 L 932 727 L 927 732 L 916 738 L 402 739 L 407 749 L 410 761 L 410 783 L 926 783 L 628 770 L 934 768 L 939 745 L 948 729 L 958 718 L 974 707 L 993 701 L 1015 701 L 1029 705 L 1043 713 L 1052 721 L 1061 733 L 1070 759 L 1069 788 L 1205 788 L 1210 786 L 1219 775 L 1219 757 L 1178 755 L 1177 748 L 1179 746 L 1216 745 L 1219 706 Z M 1183 693 L 1205 697 L 1209 700 L 1211 704 L 1209 734 L 1206 737 L 1178 736 L 1180 696 Z M 1033 539 L 1119 539 L 1132 544 L 1140 551 L 1147 565 L 1161 638 L 1161 692 L 1158 713 L 1131 703 L 1112 674 L 1092 658 L 1069 647 L 1029 634 L 1019 627 L 1017 615 L 1030 543 Z M 36 442 L 91 477 L 97 484 L 158 713 L 217 713 L 356 506 L 370 493 L 384 488 L 610 488 L 633 443 L 324 442 L 204 628 L 160 443 Z" fill="url(#vgtc-navy)" fillRule="evenodd" />

            <path d="M 604 712 L 664 712 L 753 494 L 757 488 L 1079 488 L 1058 470 L 1035 454 L 1018 446 L 1001 442 L 647 442 L 623 488 L 691 488 L 693 490 Z" fill="url(#vgtc-orange)" fillRule="evenodd" />

            <g fill="url(#vgtc-navy)" opacity=".96">
              <path className="speed" d="M74 723 L281 726 L281 732 L75 729 Z" />
              <path className="speed s2" d="M108 746 L282 748 L282 754 L108 752 Z" />
              <path className="speed s3" d="M112 769 L282 771 L282 777 L112 775 Z" />
            </g>

            <g className="complete-wheel left-wheel" aria-label="left complete tire">
              <circle cx="344" cy="770" r="58" fill="url(#vgtc-navy)" />
              <circle cx="344" cy="770" r="53" fill="none" stroke="#0A1A2A" strokeWidth="4" />
              <g fill="none" stroke="#294158" strokeWidth="2.2" strokeLinecap="round" opacity=".62">
                <path d="M312 744l8 6 M306 758l10 3 M305 773l10 0 M308 789l9-3 M315 802l7-6" />
                <path d="M376 744l-8 6 M382 758l-10 3 M383 773l-10 0 M380 789l-9-3 M373 802l-7-6" />
              </g>
              <circle cx="344" cy="770" r="31" fill="#FFFFFF" />
              <g className="wheel" aria-label="left rotating rim">
                <circle cx="344" cy="770" r="22" fill="url(#vgtc-navy)" />
                <g className="wheel-mark" fill="none" stroke="#3A5369" strokeWidth="2" strokeLinecap="round">
                  <path d="M344 750v9 M344 781v9 M324 770h9 M355 770h9 M330 756l7 7 M351 777l7 7 M330 784l7-7 M351 763l7-7" />
                </g>
                <circle cx="344" cy="770" r="4.5" fill="#0A1B2B" />
              </g>
              <path d="M316 746 A40 40 0 0 1 347 733" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity=".16" />
            </g>

            <g className="complete-wheel right-wheel" aria-label="right complete tire">
              <circle cx="1003" cy="770" r="58" fill="url(#vgtc-navy)" />
              <circle cx="1003" cy="770" r="53" fill="none" stroke="#0A1A2A" strokeWidth="4" />
              <g fill="none" stroke="#294158" strokeWidth="2.2" strokeLinecap="round" opacity=".62">
                <path d="M971 744l8 6 M965 758l10 3 M964 773l10 0 M967 789l9-3 M974 802l7-6" />
                <path d="M1035 744l-8 6 M1041 758l-10 3 M1042 773l-10 0 M1039 789l-9-3 M1032 802l-7-6" />
              </g>
              <circle cx="1003" cy="770" r="31" fill="#FFFFFF" />
              <g className="wheel" aria-label="right rotating rim">
                <circle cx="1003" cy="770" r="22" fill="url(#vgtc-navy)" />
                <g className="wheel-mark" fill="none" stroke="#3A5369" strokeWidth="2" strokeLinecap="round">
                  <path d="M1003 750v9 M1003 781v9 M983 770h9 M1014 770h9 M989 756l7 7 M1010 777l7 7 M989 784l7-7 M1010 763l7-7" />
                </g>
                <circle cx="1003" cy="770" r="4.5" fill="#0A1B2B" />
              </g>
              <path d="M975 746 A40 40 0 0 1 1006 733" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity=".16" />
            </g>
          </g>
        </svg>
      </div>

      {text && (
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text)', textAlign: 'center', background: 'transparent' }}>
          {text}
        </div>
      )}
      {subText && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320, lineHeight: 1.4, background: 'transparent' }}>
          {subText}
        </div>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.06)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        animation: 'fadeIn 0.15s ease-out'
      }}>
        {content}
      </div>
    );
  }

  return content;
}

