package app.andrey_voroshkov.chorus_laptimer;

import android.content.res.Resources;

import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentActivity;
import androidx.fragment.app.FragmentManager;
import androidx.viewpager2.adapter.FragmentStateAdapter;

/**
 * A {@link FragmentStateAdapter} that returns a fragment corresponding to
 * one of the sections/tabs/pages.
 */
public class SectionsPagerAdapter extends FragmentStateAdapter {

    private Resources resources;

    public SectionsPagerAdapter(@NonNull FragmentActivity fragmentActivity, Resources resources) {
        super(fragmentActivity);
        this.resources = resources;
    }


    public CharSequence getPageTitle(int position) {
        switch (position) {
            case 0: return resources.getString(R.string.tab_setup);
            case 1: return resources.getString(R.string.tab_frequency);
            case 2: return resources.getString(R.string.tab_pilots);
            case 3: return resources.getString(R.string.tab_race);
            default: return null;
        }
    }


    @NonNull
    @Override
    public Fragment createFragment(int position) {
        // getItem is called to instantiate the fragment for the given page.
        // Return a DeviceSetupFragment (defined as a static inner class below).
        switch (position) {
            case 0: return RaceSetupFragment.newInstance(position + 1);
            case 1: return ChannelsSetupFragment.newInstance(position + 1);
            case 2: return PilotsSetupFragment.newInstance(position + 1);
            case 3: return RaceResultFragment.newInstance(position + 1);
        }
        return null;

    }


    @Override
    public int getItemCount() {
        return 4;
    }
}

