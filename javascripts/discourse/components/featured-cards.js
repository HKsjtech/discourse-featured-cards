import discourseComputed from "discourse-common/utils/decorators";
import { observes } from "discourse-common/utils/decorators";
import Component from "@ember/component";
import { next } from "@ember/runloop";
import { inject as service } from "@ember/service";
import { defaultHomepage } from "discourse/lib/utilities";

const featuredTags = settings.featured_tags.replaceAll("|", " ");

function shuffle(array) {
  array = [...array];

  // https://stackoverflow.com/a/12646864
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

export default Component.extend({
  router: service("router"),
  isLoading: true,
  classNameBindings: "isLoading",
  pos: { top: 0, left: 0, x: 0, y: 0 },

  init() {
    this._super();
    this.set("isLoading", true);
    this.loadTopics();
  },

  didInsertElement() {
    this._super(...arguments);
    this._onScroll = () => {
      if (!this._programmaticScroll) {
        this.selectedIndex = this.activeCardIndex();
      }
      this.updateProgress();
    };
    this._onScrollEnd = () => {
      this._programmaticScroll = false;
    };
    this.element.addEventListener("scroll", this._onScroll, true);
    this.element.addEventListener("scrollend", this._onScrollEnd, true);
    window.addEventListener("resize", this._onScroll);
  },

  willDestroyElement() {
    this._super(...arguments);
    this.element.removeEventListener("scroll", this._onScroll, true);
    this.element.removeEventListener("scrollend", this._onScrollEnd, true);
    window.removeEventListener("resize", this._onScroll);
    clearTimeout(this._scrollUnlock);
  },

  didRender() {
    this.container = this.element.querySelector(".featured-cards-container");
    this.updateProgress();
  },

  cardElements() {
    return this.container
      ? [...this.container.querySelectorAll(".featured-card")]
      : [];
  },

  activeCardIndex() {
    const container = this.container;
    const cards = this.cardElements();
    if (!container || !cards.length) {
      return 0;
    }

    const styles = window.getComputedStyle(container);
    const pad = parseFloat(styles.paddingLeft) || 0;
    const origin = container.getBoundingClientRect().left + pad;
    let active = 0;

    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      if (rect.left - origin <= rect.width / 2) {
        active = index;
      }
    });

    return active;
  },

  selectIndex(index) {
    const count = this.cardElements().length;
    if (!count) {
      return;
    }

    this.selectedIndex = Math.min(count - 1, Math.max(0, index));
    this.scrollCardIntoView(this.selectedIndex);
    this.updateProgress();
  },

  scrollCardIntoView(index) {
    const container = this.container;
    const card = this.cardElements()[index];
    if (!container || !card) {
      return;
    }

    const styles = window.getComputedStyle(container);
    const pad = parseFloat(styles.paddingLeft) || 0;
    const max = container.scrollWidth - container.clientWidth;
    const delta =
      card.getBoundingClientRect().left -
      container.getBoundingClientRect().left -
      pad;
    const target = Math.min(max, Math.max(0, container.scrollLeft + delta));

    if (Math.abs(target - container.scrollLeft) <= 1) {
      return;
    }

    this._programmaticScroll = true;
    container.scrollTo({ left: target, behavior: "smooth" });
    clearTimeout(this._scrollUnlock);
    this._scrollUnlock = setTimeout(() => {
      this._programmaticScroll = false;
    }, 700);
  },

  scrollByCard(direction) {
    const current = Number.isInteger(this.selectedIndex)
      ? this.selectedIndex
      : this.activeCardIndex();
    this.selectIndex(current + direction);
  },

  updateProgress() {
    const container = this.container;
    const controls = this.element?.querySelector(".featured-cards-controls");
    const dots = this.element?.querySelectorAll(".featured-cards-dot");
    const prev = this.element?.querySelector(".featured-cards-prev");
    const next = this.element?.querySelector(".featured-cards-next");
    if (!container || !controls) {
      return;
    }

    const cards = this.cardElements();
    const count = cards.length;
    const max = container.scrollWidth - container.clientWidth;
    const active = Math.min(
      Math.max(Number.isInteger(this.selectedIndex) ? this.selectedIndex : 0, 0),
      Math.max(count - 1, 0)
    );
    this.selectedIndex = active;

    dots?.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === active);
    });

    controls.classList.toggle("is-hidden", count < 2 || max <= 1);
    if (prev) {
      prev.disabled = active <= 0;
    }
    if (next) {
      next.disabled = count === 0 || active >= count - 1;
    }
  },

  @observes("category")
  categoryChanged() {
    if (settings.scope_to_category) {
      this.loadTopics();
    }
  },

  loadTopics() {
    const loadParams = { tags: featuredTags, period: settings.top_period };
    if (settings.featured_category > 0) {
      loadParams.category = settings.featured_category;
    }

    this.store
      .findFiltered("topicList", {
        filter: settings.topic_source,
        params: loadParams,
      })
      .then((list) => {
        this.selectedIndex = 0;
        this.set("list", list);
        next(this, () => this.set("isLoading", false)); // Use `next` for CSS animation
      });
  },

  @discourseComputed("list.topics")
  filteredTopics(topics) {
    if (!topics) return;
    let filteredTopics = topics.filter((topic) => topic.tags && settings.featured_tags.split("|").some(tag=> topic.tags.includes(tag)));

    if (settings.randomize_topics) {
      filteredTopics = shuffle(filteredTopics);
    }

    return filteredTopics.slice(0, settings.maximum_topic_count);
  },

  @discourseComputed("site.mobileView", "router.currentRoute", "router.currentRouteName")
  shouldDisplay(isMobile, currentRoute, currentRouteName) {
    if (isMobile && !settings.display_mobile) return false;
    if (currentRoute) {
      if (settings.show_on === "homepage") {
        return currentRouteName == `discovery.${defaultHomepage()}`;
      } else if (settings.show_on === "top_menu") {
        const topMenuRoutes = this.siteSettings.top_menu
          .split("|")
          .filter(Boolean);
        return topMenuRoutes.includes(currentRoute.localName);
      } else if (settings.show_on === "all") {
        return (
          currentRouteName.indexOf("editCategory") &&
          currentRouteName.indexOf("admin") &&
          currentRouteName.indexOf("full-page-search")
        );
      } else {
        return false;
      }
    }
  },

  actions: {
    scrollPrev() {
      this.scrollByCard(-1);
    },

    scrollNext() {
      this.scrollByCard(1);
    },

    scrollToIndex(index) {
      this.selectIndex(Number(index));
    },
  },

  @discourseComputed()
  showHeading() {
    if (settings.show_component_heading) {
      const titleElement = document.createElement("h3");
      titleElement.classList.add("component-heading");
      titleElement.innerHTML = settings.heading_text;
      return titleElement;
    }
  },
});
