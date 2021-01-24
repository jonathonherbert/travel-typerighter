import {
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import "./App.css";
import { diff_match_patch } from "diff-match-patch";
import { StepMap } from "prosemirror-transform";

const isBrowser = typeof window !== "undefined";
const isFirefox = isBrowser && (window as any).mozInnerScreenX != null;
const inputContainerId = "input-container";
const addInputAfterDelay = (id: number, delay: number) =>
  setTimeout(() => {
    const idAttr = `tr-input-${id.toString()}`;
    if (document.getElementById(idAttr)) {
      return;
    }
    const input = document.createElement("textarea");
    input.setAttribute("id", idAttr);
    input.setAttribute("data-typerighter", "true");
    document.getElementById(inputContainerId)?.appendChild(input);
  }, delay);

addInputAfterDelay(1, 500);

function App() {
  const [subscribedElements] = useTyperighter();

  return (
    <div className="App">
      <div className="input-scroll-container">
        <div className="input-container">
          <div id={inputContainerId}></div>
        </div>
      </div>
      {subscribedElements.map((el) => (
        <TyperighterInputOverlay
          element={el.node}
          style={el.style}
          key={el.node.id}
        />
      ))}
    </div>
  );
}

type IPlacedMatch = IMatch & {
  left: number;
  top: number;
  width: number;
  height: number;
};

type IInputOverlayProps = {
  element: ValidTyperighterInput;
  style: CSSProperties;
};
const TyperighterInputOverlay = ({ element, style }: IInputOverlayProps) => {
  const { matches, text } = useMatchesForInput(element);
  const [placedMatches, setPlacedMatches] = useState([] as IPlacedMatch[]);
  const [elementRect, setElementRect] = useState(
    undefined as DOMRect | undefined
  );
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Set the initial input rect, and listen for changes that
  // affect match layout or visibility.
  useEffect(() => {
    // Initial rect
    const rect = element.getBoundingClientRect();
    setElementRect(rect);

    // Changes in size
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setElementRect(rect);
    });
    observer.observe(element);

    // Scrolling behavior
    const onScroll = (event: Event) => {
      const rect = element.getBoundingClientRect();
      setElementRect(rect);
    };
    document.addEventListener("scroll", onScroll, true);

    // Clean up afterwards
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", onScroll);
    };
  }, [element]);

  // Update when matches change.
  useLayoutEffect(() => {
    if (!mirrorRef.current) {
      return;
    }

    const mirrorElement = mirrorRef.current;
    try {
      // Getting ranges in the document can throw, and is edge-casey.
      // Defend against a possible error propagating up the tree.
      const newPlacedMatches = matches.map((match) => ({
        ...match,
        ...getCoordsForMatch(match, mirrorElement),
      }));

      setPlacedMatches(newPlacedMatches);
    } catch (e) {
      console.warn(
        "[typerighter-pocket]: Error attempting to get range for matches"
      );
      console.warn(e);
    }
  }, [matches, elementRect?.width, elementRect?.height]);

  const computedStyle = elementRect
    ? {
        ...style,
        width: elementRect.width,
        height: elementRect.height,
      }
    : style;
  return (
    <div style={{ position: "absolute", top: 0, left: 0 }}>
      <div style={computedStyle} ref={mirrorRef}>
        {text}
      </div>
      {elementRect && (
        <div
          style={{
            position: "absolute",
            top: elementRect.top,
            left: elementRect.left,
          }}
        >
          {placedMatches.map((match) => (
            <div
              key={match.id}
              style={{
                position: "absolute",
                top: match.top,
                left: match.left,
                width: match.width,
                height: match.height,
                backgroundColor: "#ff000026",
                borderBottom: "2px solid red",
              }}
            ></div>
          ))}
        </div>
      )}
      <div style={{ marginTop: "50px" }}>
        {placedMatches.map((match) => (
          <div key={match.id}>
            {match.id} `{match.text}` {match.from}-{match.to} {match.left}{" "}
            {match.top} {match.width} {match.height}
          </div>
        ))}
      </div>
    </div>
  );
};

const getCoordsForMatch = (match: IMatch, mirrorNode: HTMLDivElement) => {
  const range = document.createRange();
  console.log(match.from, match.to);
  range.setStart(mirrorNode.firstChild!, match.from);
  range.setEnd(mirrorNode.firstChild!, Math.max(match.to, 0));
  const rect = range.getBoundingClientRect();
  console.log(match, rect);
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

const useTyperighter = (): [
  InputState[],
  React.Dispatch<React.SetStateAction<InputState[]>>
] => {
  const [subscribedElements, setSubscribedElements] = useState(
    [] as InputState[]
  );

  // Listen for new Typerighter-enabled elements
  useEffect(() => {
    const insertListener = (event: AnimationEvent) => {
      if (
        event.animationName === "nodeInserted" &&
        isTyperighterifiable(event.target)
      ) {
        const newInput = event.target as ValidTyperighterInput;
        setSubscribedElements((currentElements) => {
          if (currentElements.map((_) => _.node).includes(newInput)) {
            return currentElements;
          }
          const style = getStyleForElement(newInput);
          console.log(`Registered new input, ${newInput.id}`);
          return [...currentElements, { node: newInput, style }];
        });
      }
    };
    document.addEventListener("animationstart", insertListener);
  });

  return [subscribedElements, setSubscribedElements];
};

const diff = new diff_match_patch();

type MatchState = {
  matches: IMatch[];
  text: string;
  steps: StepMap[];
};

const defaultMatchState: MatchState = {
  matches: [],
  text: "",
  steps: [],
};

const useMatchesForInput = (
  inputElement: ValidTyperighterInput
): MatchState => {
  const [matchState, setMatchState] = useState(defaultMatchState);
  const [textInFlight, setTextInFlight] = useState(false);

  useEffect(() => {
    const handleInputChanged = async (event: Event) => {
      if (!isTyperighterifiable(event.target)) {
        return;
      }
      const text = event.target.value;

      setMatchState((matchState) => {
        const incomingStepMaps = getStepsForIncomingText(matchState.text, text);
        const mappedMatches = mapMatchesThroughSteps(
          matchState.matches,
          incomingStepMaps
        );
        const newStepMaps = matchState.steps.concat(incomingStepMaps);
        console.log("apply steps", newStepMaps);
        return { matches: mappedMatches, steps: newStepMaps, text };
      });
    };

    inputElement.addEventListener("input", handleInputChanged);
  }, [inputElement]);

  useEffect(() => {
    if (textInFlight) {
      return;
    }
    const eventuallyMatches = getMatchesForString(matchState.text);
    setTextInFlight(true);
    setMatchState((matchState) => ({ ...matchState, steps: [] }));
    eventuallyMatches.then((matches) => {
      console.log("got new matches", matches);
      setMatchState((matchState) => {
        const mappedMatches = mapMatchesThroughSteps(
          matches || [],
          matchState.steps
        );
        return { ...matchState, steps: [], matches: mappedMatches };
      });
      setTextInFlight(false);
    });
  }, [matchState.text]);

  return matchState;
};

const mapMatchesThroughSteps = (matches: IMatch[], steps: StepMap[]) =>
  matches.map((match) => {
    console.log("mapping", match, steps);
    return steps.reduce(
      ({ from, to, ...rest }, step) => ({
        from: step.map(from),
        to: step.map(to),
        ...rest,
      }),
      match
    );
  });

const getStepsForIncomingText = (
  current: string,
  incoming: string
): StepMap[] => {
  const diffs = diff.diff_main(current, incoming);
  const { steps } = diffs.reduce(
    ({ steps, cur }, [type, text]) => {
      switch (type) {
        case 0:
          return { steps, cur: cur + text.length };
        case 1:
          // Added
          return {
            steps: steps.concat(new StepMap([cur, 0, text.length])),
            cur,
          };
        case -1:
          // Removed
          return {
            steps: steps.concat(new StepMap([cur, text.length, 0])),
            cur,
          };
        default:
          return { steps, cur };
      }
    },
    { cur: 0, steps: [] as StepMap[] }
  );

  return steps;
};

/**
 * Copy the styles from the given input element.
 */
const getStyleForElement = (element: ValidTyperighterInput): CSSProperties => {
  const computed = window.getComputedStyle(element) as CSSProperties;
  const style = {} as CSSProperties;
  const isInput = element.nodeName === "INPUT";
  // Default textarea styles
  style.whiteSpace = "pre-wrap";
  if (!isInput) style.wordWrap = "break-word"; // only for textarea-s

  // Position off-screen
  style.position = "absolute"; // required to return coordinates properly
  // if (!debug)
  //   style.visibility = 'hidden';  // not 'display: none' because we want rendering

  properties.forEach((prop) => {
    if (isInput && prop === "lineHeight") {
      // Special case for <input>s because text is rendered centered and line height may be != height
      if (computed.boxSizing === "border-box") {
        var height = parsePropAsInt(computed.height);
        var outerHeight =
          parsePropAsInt(computed.paddingTop) +
          parsePropAsInt(computed.paddingBottom) +
          parsePropAsInt(computed.borderTopWidth) +
          parsePropAsInt(computed.borderBottomWidth);
        var targetHeight = outerHeight + parsePropAsInt(computed.lineHeight);
        if (height > targetHeight) {
          style.lineHeight = height - outerHeight + "px";
        } else if (height === targetHeight) {
          style.lineHeight = computed.lineHeight;
        } else {
          style.lineHeight = "0";
        }
      } else {
        style.lineHeight = computed.height;
      }
    } else {
      (style[prop] as any) = computed[prop] as string;
    }
  });

  if (isFirefox) {
    // Firefox lies about the overflow property for textareas: https://bugzilla.mozilla.org/show_bug.cgi?id=984275
    if (element.scrollHeight > parsePropAsInt(computed.height))
      style.overflowY = "scroll";
  } else {
    style.overflow = "hidden"; // for Chrome to not render a scrollbar; IE keeps overflowY = 'scroll'
  }

  return style;
};

const parsePropAsInt = (prop: string | number | void): number =>
  prop ? (typeof prop === "number" ? prop : parseInt(prop.toString())) : 0;

const isTyperighterifiable = (
  maybeElement: unknown
): maybeElement is HTMLTextAreaElement | HTMLInputElement =>
  maybeElement instanceof HTMLInputElement ||
  maybeElement instanceof HTMLTextAreaElement;

type ValidTyperighterInput = HTMLInputElement | HTMLTextAreaElement;
type InputState = { node: ValidTyperighterInput; style: CSSProperties };

interface IMatch {
  from: number;
  to: number;
  text: string;
  id: string;
}

const getMatchesForString = (text: string): Promise<IMatch[]> =>
  new Promise((res) => {
    console.log({ text });
    setTimeout(() => {
      const tokens = text.split(/([\s,.!?]+)/g);
      const matches: IMatch[] = [];
      let curPos = 0;
      let id = 0;

      tokens.forEach((token) => {
        if (token.length > 4) {
          matches.push({
            from: curPos,
            to: curPos + token.length,
            text: token,
            id: id.toString(),
          });
          id++;
        }
        curPos += token.length;
      });
      res(matches);
    }, 1000);
  });

const properties: Partial<keyof CSSProperties>[] = [
  "direction", // RTL support
  "boxSizing",
  "width", // on Chrome and IE, exclude the scrollbar, so the mirror div wraps exactly as the textarea does
  "height",
  "overflowX",
  "overflowY", // copy the scrollbar for IE

  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",

  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",

  // https://developer.mozilla.org/en-US/docs/Web/CSS/font
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",

  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration", // might not make a difference, but better be safe

  "letterSpacing",
  "wordSpacing",

  "tabSize",
  // "MozTabSize",
];

export default App;
