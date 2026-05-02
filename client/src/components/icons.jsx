function svgProps(className = "h-4 w-4") {
  return {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };
}

export function Icon({ name, className = "h-4 w-4" }) {
  switch (name) {
    case "home":
      return (
        <svg {...svgProps(className)}>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "list":
      return (
        <svg {...svgProps(className)}>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...svgProps(className)}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      );
    case "audit":
      return (
        <svg {...svgProps(className)}>
          <path d="M3 4h18v4H3z" />
          <path d="M5 8v12h14V8" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...svgProps(className)}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </svg>
      );
    case "wifi":
      return (
        <svg {...svgProps(className)}>
          <path d="M5 13a10 10 0 0114 0" />
          <path d="M2 9a14 14 0 0120 0" />
          <path d="M8.5 16.5a5 5 0 017 0" />
          <circle cx="12" cy="20" r="1" />
        </svg>
      );
    case "check":
      return (
        <svg {...svgProps(className)}>
          <path d="M5 12l5 5L20 7" />
        </svg>
      );
    case "shield":
      return (
        <svg {...svgProps(className)}>
          <path d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7z" />
        </svg>
      );
    case "grid":
      return (
        <svg {...svgProps(className)}>
          <path d="M3 3h7v7H3z" />
          <path d="M14 3h7v7h-7z" />
          <path d="M3 14h7v7H3z" />
          <path d="M14 14h7v7h-7z" />
        </svg>
      );
    case "alert":
      return (
        <svg {...svgProps(className)}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.86l-8.5 14a2 2 0 001.7 3h17a2 2 0 001.7-3l-8.5-14a2 2 0 00-3.4 0z" />
        </svg>
      );
    case "doc":
      return (
        <svg {...svgProps(className)}>
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
          <path d="M14 3v6h6" />
        </svg>
      );
    case "building":
      return (
        <svg {...svgProps(className)}>
          <path d="M4 21V7l8-4 8 4v14" />
          <path d="M9 21v-6h6v6" />
          <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
        </svg>
      );
    case "layers":
      return (
        <svg {...svgProps(className)}>
          <path d="M12 3l9 5-9 5-9-5z" />
          <path d="M3 13l9 5 9-5" />
          <path d="M3 17l9 5 9-5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...svgProps(className)}>
          <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10 21h4" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...svgProps(className)}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...svgProps(className)}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "lock":
      return (
        <svg {...svgProps(className)}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
      );
    case "comment":
      return (
        <svg {...svgProps(className)}>
          <path d="M21 12a8 8 0 01-11.4 7.3L4 21l1.8-5A8 8 0 1121 12z" />
        </svg>
      );
    case "plus":
      return (
        <svg {...svgProps(className)}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...svgProps(className)}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
      );
    case "logout":
      return (
        <svg {...svgProps(className)}>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps(className)}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
